/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {CompileDirectiveMetadata, CompileIdentifierMetadata, CompileNgModuleMetadata, CompilePipeSummary, CompileProviderMetadata, CompileStylesheetMetadata, CompileTypeSummary, ProviderMeta, ProxyClass, identifierName, ngModuleJitUrl, sharedStylesheetJitUrl, templateJitUrl, templateSourceUrl} from '../compile_metadata';
import {CompileReflector} from '../compile_reflector';
import {CompilerConfig} from '../config';
import {ConstantPool} from '../constant_pool';
import {Type} from '../core';
import {CompileMetadataResolver} from '../metadata_resolver';
import {NgModuleCompiler} from '../ng_module_compiler';
import * as ir from '../output/output_ast';
import {interpretStatements} from '../output/output_interpreter';
import {JitEvaluator} from '../output/output_jit';
import {CompiledStylesheet, StyleCompiler} from '../style_compiler';
import {SummaryResolver} from '../summary_resolver';
import {TemplateAst} from '../template_parser/template_ast';
import {TemplateParser} from '../template_parser/template_parser';
import {Console, OutputContext, SyncAsync, stringify} from '../util';
import {ViewCompiler} from '../view_compiler/view_compiler';

export interface ModuleWithComponentFactories {
  ngModuleFactory: object;
  componentFactories: object[];
}

/**
 * An internal module of the Angular compiler that begins with component types,
 * extracts templates, and eventually produces a compiled version of the component
 * ready for linking into an application.
 *
 * @security  When compiling templates at runtime, you must ensure that the entire template comes
 * from a trusted source. Attacker-controlled data introduced by a template could expose your
 * application to XSS risks.  For more detail, see the [Security Guide](http://g.co/ng/security).
 */
export class JitCompiler {
  private _compiledTemplateCache = new Map<Type, CompiledTemplate>();
  private _compiledHostTemplateCache = new Map<Type, CompiledTemplate>();
  private _compiledDirectiveWrapperCache = new Map<Type, Type>();
  private _compiledNgModuleCache = new Map<Type, object>();
  private _sharedStylesheetCount = 0;
  private _addedAotSummaries = new Set<() => any[]>();

  constructor(
      private _metadataResolver: CompileMetadataResolver, private _templateParser: TemplateParser,
      private _styleCompiler: StyleCompiler, private _viewCompiler: ViewCompiler,
      private _ngModuleCompiler: NgModuleCompiler, private _summaryResolver: SummaryResolver<Type>,
      private _reflector: CompileReflector, private _jitEvaluator: JitEvaluator,
      private _compilerConfig: CompilerConfig, private _console: Console,
      private getExtraNgModuleProviders: (ngModule: any) => CompileProviderMetadata[]) {}

  compileModuleSync(moduleType: Type): object {
    return SyncAsync.assertSync(this._compileModuleAndComponents(moduleType, true));
  }

  // 注释：编译bootstrap的模块
  compileModuleAsync(moduleType: Type): Promise<object> {
    // 注释：其实 JTI 编译在这步做的，异步编译模块和组件
    return Promise.resolve(this._compileModuleAndComponents(moduleType, false));
  }

  compileModuleAndAllComponentsSync(moduleType: Type): ModuleWithComponentFactories {
    return SyncAsync.assertSync(this._compileModuleAndAllComponents(moduleType, true));
  }

  compileModuleAndAllComponentsAsync(moduleType: Type): Promise<ModuleWithComponentFactories> {
    return Promise.resolve(this._compileModuleAndAllComponents(moduleType, false));
  }

  getComponentFactory(component: Type): object {
    const summary = this._metadataResolver.getDirectiveSummary(component);
    return summary.componentFactory as object;
  }

  loadAotSummaries(summaries: () => any[]) {
    this.clearCache();
    this._addAotSummaries(summaries);
  }

  private _addAotSummaries(fn: () => any[]) {
    if (this._addedAotSummaries.has(fn)) {
      return;
    }
    this._addedAotSummaries.add(fn);
    const summaries = fn();
    for (let i = 0; i < summaries.length; i++) {
      const entry = summaries[i];
      if (typeof entry === 'function') {
        this._addAotSummaries(entry);
      } else {
        const summary = entry as CompileTypeSummary;
        this._summaryResolver.addSummary(
            {symbol: summary.type.reference, metadata: null, type: summary});
      }
    }
  }

  // 注释：过滤带有 AOT 的模块
  hasAotSummary(ref: Type) { return !!this._summaryResolver.resolveSummary(ref); }

  // 注释：过滤带有 AOT 的模块
  private _filterJitIdentifiers(ids: CompileIdentifierMetadata[]): any[] {
    return ids.map(mod => mod.reference).filter((ref) => !this.hasAotSummary(ref));
  }

  // 注释：做了三件事: 
  //  1. 加载模块 `this._loadModules`
  //  2. 编译入口组件 `this._compileComponents`
  //  3. 编译模块 `this._compileModule`
  private _compileModuleAndComponents(moduleType: Type, isSync: boolean): SyncAsync<object> {
    // 注释：其实调用的是这步，编译主模块和组件
    return SyncAsync.then(this._loadModules(moduleType, isSync), () => {  // 注释：先加载模块
      this._compileComponents(moduleType, null); // 注释：异步有结果之后的回调函数，编译主模块上的所有入口组件 
      return this._compileModule(moduleType); // 注释：返回编译后的模块工厂
    });
  }

  private _compileModuleAndAllComponents(moduleType: Type, isSync: boolean):
      SyncAsync<ModuleWithComponentFactories> {
    return SyncAsync.then(this._loadModules(moduleType, isSync), () => {
      const componentFactories: object[] = [];
      this._compileComponents(moduleType, componentFactories);
      return {
        ngModuleFactory: this._compileModule(moduleType),
        componentFactories: componentFactories
      };
    });
  }

  // 注释：异步加载解析主模块，也就是 bootstrap 的 ngModule
  // 最后所有被导入 AppModule 关联的模块的元数据都已经加载进了缓存中，包括了从 AppModule 开始除了懒加载模块之外的的整个模块树，树上的所有指令，组件和管道，以及所有的服务
  private _loadModules(mainModule: any, isSync: boolean): SyncAsync<any> {
    const loading: Promise<any>[] = [];
    // 注释：从元数据中获得根模块的 __annotations__ 并格式化
    const mainNgModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    // 注释：过滤 AOT 模块并异步编加载数据中全部模块传递过来的指令组件和和管道
    // Note: for runtime compilation, we want to transitively compile all modules,
    // so we also need to load the declared directives / pipes for all nested modules.
    // 注释：过滤掉根模块元数据中的 AOT 模块
    this._filterJitIdentifiers(mainNgModule.transitiveModule.modules).forEach((nestedNgModule) => {
      // getNgModuleMetadata only returns null if the value passed in is not an NgModule
      // 注释：获取模块的元数据
      const moduleMeta = this._metadataResolver.getNgModuleMetadata(nestedNgModule) !;
      this._filterJitIdentifiers(moduleMeta.declaredDirectives).forEach((ref) => {
        // 注释：异步编加载数据中全部指令组件和和管道
        const promise =
            // 这里先提取所有指令和组件的元数据，并把元数据中的 template 字符串编译成 htmlAST
            this._metadataResolver.loadDirectiveMetadata(moduleMeta.type.reference, ref, isSync);
        if (promise) {
          loading.push(promise);
        }
      });
      this._filterJitIdentifiers(moduleMeta.declaredPipes)
          .forEach((ref) => this._metadataResolver.getOrLoadPipeMetadata(ref));
    });
    // 注释：最后全部并行 Promise
    return SyncAsync.all(loading);
  }

  // 注释：angular 会用 Map 缓存模块工厂，并且在需要返回编译的模块工厂时，优先去缓存中寻找已经被编译过的模块工厂
  private _compileModule(moduleType: Type): object {
    // 注释：从缓存拿到模块工厂
    let ngModuleFactory = this._compiledNgModuleCache.get(moduleType) !; // 注释：读取缓存
    if (!ngModuleFactory) {
      // 注释：读取模块的元数据
      const moduleMeta = this._metadataResolver.getNgModuleMetadata(moduleType) !;
      // 注释：调用实例化 JITCompiler 时候传入方法，创建额外的模块服务供应商 （在 CompilerImpl 传入）
      // Always provide a bound Compiler
      const extraProviders = this.getExtraNgModuleProviders(moduleMeta.type.reference);
       // 注释：创建输出上下
      const outputCtx = createOutputContext();
      // 注释：构建编译结果：是一个对象，只有 ngModuleFactoryVar 这么一个属性：ngModuleFactoryVar: "AppModuleNgFactory" 内部通过构建服务供应商和模块的AST，很复杂
      const compileResult = this._ngModuleCompiler.compile(outputCtx, moduleMeta, extraProviders);
      // 注释：创建模块工厂函数
      ngModuleFactory = this._interpretOrJit(
          ngModuleJitUrl(moduleMeta), outputCtx.statements)[compileResult.ngModuleFactoryVar];
      this._compiledNgModuleCache.set(moduleMeta.type.reference, ngModuleFactory);
    }
    return ngModuleFactory;
  }

  // 注释：编译主模块上的所有组件和指令
  // 主要目的：拿到 组件模板编译类，放在 templates 中
  _compileComponents(mainModule: Type, allComponentFactories: object[]|null) {
    // 注释：获取主模块的元数据
    const ngModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    // 注释：jit 模块中所有的指令Map，key为指令组件，value为所属的模块
    const moduleByJitDirective = new Map<any, CompileNgModuleMetadata>();
    // 注释：组件模板编译类的集合
    const templates = new Set<CompiledTemplate>();

    // 注释：过滤AOT模块并返回包括自身和引入模块的所有模块
    const transJitModules = this._filterJitIdentifiers(ngModule.transitiveModule.modules);

    // 注释：编译所有模块中组件，（localMod 是模块的class），顺序为先 import 后 declare 的
    transJitModules.forEach((localMod) => {
      const localModuleMeta = this._metadataResolver.getNgModuleMetadata(localMod) !;
      // 注释：指令和组件都是 declaredDirectives (在angular里 @Component组件 继承了 指令@Directive)
      this._filterJitIdentifiers(localModuleMeta.declaredDirectives).forEach((dirRef) => {
        moduleByJitDirective.set(dirRef, localModuleMeta); // 注释：key为指令组件，value为所属的模块
        // 注释：指令组件的元数据，为 CompileDirectiveMetadata 的实例
        const dirMeta = this._metadataResolver.getDirectiveMetadata(dirRef);
        // 注释：只编译组件
        // 注释：拿到组件的模板，并放在组件的集合 templates：Set 中
        if (dirMeta.isComponent) {
          // 注释：创建并收集组件模板编译类
          templates.add(this._createCompiledTemplate(dirMeta, localModuleMeta));
          if (allComponentFactories) {
            const template =
                this._createCompiledHostTemplate(dirMeta.type.reference, localModuleMeta);
            templates.add(template);
            allComponentFactories.push(dirMeta.componentFactory as object);
          }
        }
      });
    });

    // 注释：再编译每个组件指令上的entryComponent类
    transJitModules.forEach((localMod) => {
      const localModuleMeta = this._metadataResolver.getNgModuleMetadata(localMod) !;
      // 先编译`declarations`的指令和组件的 `entryComponents` 组件
      this._filterJitIdentifiers(localModuleMeta.declaredDirectives).forEach((dirRef) => {
        const dirMeta = this._metadataResolver.getDirectiveMetadata(dirRef);
        if (dirMeta.isComponent) {
          dirMeta.entryComponents.forEach((entryComponentType) => {
            const moduleMeta = moduleByJitDirective.get(entryComponentType.componentType) !;
            templates.add(
                this._createCompiledHostTemplate(entryComponentType.componentType, moduleMeta));
          });
        }
      });
      // 再编译模块上 `entryComponents` 元数据的组件
      localModuleMeta.entryComponents.forEach((entryComponentType) => {
        if (!this.hasAotSummary(entryComponentType.componentType)) {
          const moduleMeta = moduleByJitDirective.get(entryComponentType.componentType) !;
          templates.add(
              this._createCompiledHostTemplate(entryComponentType.componentType, moduleMeta));
        }
      });
    });

    // 注释：执行 _compileTemplate 编译组件模板编译类
    templates.forEach((template) => this._compileTemplate(template));
  }

  clearCacheFor(type: Type) {
    this._compiledNgModuleCache.delete(type);
    this._metadataResolver.clearCacheFor(type);
    this._compiledHostTemplateCache.delete(type);
    const compiledTemplate = this._compiledTemplateCache.get(type);
    if (compiledTemplate) {
      this._compiledTemplateCache.delete(type);
    }
  }

  clearCache(): void {
    // Note: don't clear the _addedAotSummaries, as they don't change!
    this._metadataResolver.clearCache();
    this._compiledTemplateCache.clear();
    this._compiledHostTemplateCache.clear();
    this._compiledNgModuleCache.clear();
  }

  private _createCompiledHostTemplate(compType: Type, ngModule: CompileNgModuleMetadata):
      CompiledTemplate {
    if (!ngModule) {
      throw new Error(
          `Component ${stringify(compType)} is not part of any NgModule or the module has not been imported into your module.`);
    }
    let compiledTemplate = this._compiledHostTemplateCache.get(compType);
    if (!compiledTemplate) {
      const compMeta = this._metadataResolver.getDirectiveMetadata(compType);
      assertComponent(compMeta);

      const hostMeta = this._metadataResolver.getHostComponentMetadata(
          compMeta, (compMeta.componentFactory as any).viewDefFactory);
      compiledTemplate =
          new CompiledTemplate(true, compMeta.type, hostMeta, ngModule, [compMeta.type]);
      this._compiledHostTemplateCache.set(compType, compiledTemplate);
    }
    return compiledTemplate;
  }

  // 注释：创建组件编译类
  private _createCompiledTemplate(
      compMeta: CompileDirectiveMetadata, ngModule: CompileNgModuleMetadata): CompiledTemplate {
    // 注释：优先取缓存
    let compiledTemplate = this._compiledTemplateCache.get(compMeta.type.reference);
    if (!compiledTemplate) {
      // 注释：确认是否是组件 isComponent
      assertComponent(compMeta);
      // 创建组件编译类，把组件所属模块（compType），可用的指令和组件（directives），组件元数据包含解析到的DI依赖和生命周期传入（compMeta）
      compiledTemplate = new CompiledTemplate(
          false, compMeta.type, compMeta, ngModule, ngModule.transitiveModule.directives);
      // 注释：放入缓存
      this._compiledTemplateCache.set(compMeta.type.reference, compiledTemplate);
    }
    return compiledTemplate;
  }

  // 注释：编译组件和指令
  private _compileTemplate(template: CompiledTemplate) {
    // 如果编译过了则跳出，`isCompiled` 在  `CompiledTemplate` 的 `compiled` 方法中被设置成true
    if (template.isCompiled) {
      return;
    }
    // 组件元数据
    const compMeta = template.compMeta;
    // 外部样式表
    const externalStylesheetsByModuleUrl = new Map<string, CompiledStylesheet>();
    // 输出上下文
    const outputContext = createOutputContext();
    // 解析组件样式表 @Component({styles: styleUrls})
    const componentStylesheet = this._styleCompiler.compileComponent(outputContext, compMeta);
    compMeta.template !.externalStylesheets.forEach((stylesheetMeta) => {
      const compiledStylesheet =
          this._styleCompiler.compileStyles(createOutputContext(), compMeta, stylesheetMeta);
      externalStylesheetsByModuleUrl.set(stylesheetMeta.moduleUrl !, compiledStylesheet);
    });
    this._resolveStylesCompileResult(componentStylesheet, externalStylesheetsByModuleUrl);
    // 解析出传递模块的管道（这里不知道干嘛用的）
    const pipes = template.ngModule.transitiveModule.pipes.map(
        pipe => this._metadataResolver.getPipeSummary(pipe.reference));
    // 解析组件模板，使用template字符串解析并返回解析过的模板AST和使用的管道（这里比较复杂以后再深入看）
    const {template: parsedTemplate, pipes: usedPipes} =
        this._parseTemplate(compMeta, template.ngModule, template.directives);
    // 返回编译的结果，带着一个唯一的视图ID viewClassVar
    // {
    //   rendererTypeVar: undefined,
    //   viewClassVar: "View__EmptyOutletComponent_Host_0"
    // }
    const compileResult = this._viewCompiler.compileComponent(
        outputContext, compMeta, parsedTemplate, ir.variable(componentStylesheet.stylesVar),
        usedPipes);
    const evalResult = this._interpretOrJit(
        templateJitUrl(template.ngModule.type, template.compMeta), outputContext.statements);
    // 一个视图类，返回JIT的视图，执行会开始更新或者创建视图
    const viewClass = evalResult[compileResult.viewClassVar];
    const rendererType = evalResult[compileResult.rendererTypeVar];
    // 编译完成，设置视图类并把模板编译类的isCompiled设置为true
    template.compiled(viewClass, rendererType);
  }

  // 注释：编译组件模板，返回模板AST
  private _parseTemplate(
      compMeta: CompileDirectiveMetadata, ngModule: CompileNgModuleMetadata,
      directiveIdentifiers: CompileIdentifierMetadata[]):
      {template: TemplateAst[], pipes: CompilePipeSummary[]} {
    // Note: ! is ok here as components always have a template.
    const preserveWhitespaces = compMeta.template !.preserveWhitespaces;
    const directives =
        directiveIdentifiers.map(dir => this._metadataResolver.getDirectiveSummary(dir.reference));
    const pipes = ngModule.transitiveModule.pipes.map(
        pipe => this._metadataResolver.getPipeSummary(pipe.reference));
    return this._templateParser.parse(
        compMeta, compMeta.template !.htmlAst !, directives, pipes, ngModule.schemas,
        templateSourceUrl(ngModule.type, compMeta, compMeta.template !), preserveWhitespaces);
  }

  // 注释：解析嵌套样式表
  private _resolveStylesCompileResult(
      result: CompiledStylesheet, externalStylesheetsByModuleUrl: Map<string, CompiledStylesheet>) {
    result.dependencies.forEach((dep, i) => {
      const nestedCompileResult = externalStylesheetsByModuleUrl.get(dep.moduleUrl) !;
      const nestedStylesArr = this._resolveAndEvalStylesCompileResult(
          nestedCompileResult, externalStylesheetsByModuleUrl);
      dep.setValue(nestedStylesArr);
    });
  }

  private _resolveAndEvalStylesCompileResult(
      result: CompiledStylesheet,
      externalStylesheetsByModuleUrl: Map<string, CompiledStylesheet>): string[] {
    this._resolveStylesCompileResult(result, externalStylesheetsByModuleUrl);
    return this._interpretOrJit(
        sharedStylesheetJitUrl(result.meta, this._sharedStylesheetCount++),
        result.outputCtx.statements)[result.stylesVar];
  }

  private _interpretOrJit(sourceUrl: string, statements: ir.Statement[]): any {
    if (!this._compilerConfig.useJit) {
      return interpretStatements(statements, this._reflector);
    } else {
      return this._jitEvaluator.evaluateStatements(
          sourceUrl, statements, this._reflector, this._compilerConfig.jitDevMode);
    }
  }
}

// 注释：编译组件类
class CompiledTemplate {
  private _viewClass: Function = null !;
  isCompiled = false;

  constructor(
      public isHost: boolean,
      public compType: CompileIdentifierMetadata,// 组件类，包括 diDeps依赖，lifecycleHooks生命周期，reference组件类
      public compMeta: CompileDirectiveMetadata, // 组件元数据
      public ngModule: CompileNgModuleMetadata, // 模块
      public directives: CompileIdentifierMetadata[] // 可用指令和组件
  ) {}

  // 注释：编译方法
  compiled(viewClass: Function, rendererType: any) {
    this._viewClass = viewClass;
    (<ProxyClass>this.compMeta.componentViewType).setDelegate(viewClass);
    for (let prop in rendererType) {
      (<any>this.compMeta.rendererType)[prop] = rendererType[prop];
    }
    this.isCompiled = true;
  }
}

function assertComponent(meta: CompileDirectiveMetadata) {
  if (!meta.isComponent) {
    throw new Error(
        `Could not compile '${identifierName(meta.type)}' because it is not a component.`);
  }
}

function createOutputContext(): OutputContext {
  const importExpr = (symbol: any) =>
      ir.importExpr({name: identifierName(symbol), moduleName: null, runtime: symbol});
  return {statements: [], genFilePath: '', importExpr, constantPool: new ConstantPool()};
}
