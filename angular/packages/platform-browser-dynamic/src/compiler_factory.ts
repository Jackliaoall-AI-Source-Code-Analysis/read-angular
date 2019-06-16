/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Compiler, CompilerFactory, ComponentFactory, CompilerOptions, ModuleWithComponentFactories, Inject, InjectionToken, Optional, PACKAGE_ROOT_URL, StaticProvider, TRANSLATIONS, Type, isDevMode, ɵConsole as Console, ViewEncapsulation, Injector, NgModuleFactory, TRANSLATIONS_FORMAT, MissingTranslationStrategy,} from '@angular/core';

import {StaticSymbolCache, JitCompiler, ProviderMeta, I18NHtmlParser, ViewCompiler, CompileMetadataResolver, UrlResolver, TemplateParser, NgModuleCompiler, JitEvaluator, JitSummaryResolver, SummaryResolver, StyleCompiler, PipeResolver, ElementSchemaRegistry, DomElementSchemaRegistry, ResourceLoader, NgModuleResolver, HtmlParser, CompileReflector, CompilerConfig, DirectiveNormalizer, DirectiveResolver, Lexer, Parser} from '@angular/compiler';

import {JitReflector} from './compiler_reflector';

export const ERROR_COLLECTOR_TOKEN = new InjectionToken('ErrorCollector');

/**
 * A default provider for {@link PACKAGE_ROOT_URL} that maps to '/'.
 */
export const DEFAULT_PACKAGE_URL_PROVIDER = {
  provide: PACKAGE_ROOT_URL,
  useValue: '/'
};

const _NO_RESOURCE_LOADER: ResourceLoader = {
  get(url: string): Promise<string>{
      throw new Error(
          `No ResourceLoader implementation has been provided. Can't read the url "${url}"`);}
};

const baseHtmlParser = new InjectionToken('HtmlParser');

export class CompilerImpl implements Compiler {
  private _delegate: JitCompiler;
  public readonly injector: Injector;
  constructor(
      injector: Injector, private _metadataResolver: CompileMetadataResolver,
      templateParser: TemplateParser, styleCompiler: StyleCompiler, viewCompiler: ViewCompiler,
      ngModuleCompiler: NgModuleCompiler, summaryResolver: SummaryResolver<Type<any>>,
      compileReflector: CompileReflector, jitEvaluator: JitEvaluator,
      compilerConfig: CompilerConfig, console: Console) {
    // 注释：创建 JIT 编译器
    this._delegate = new JitCompiler(
        _metadataResolver, templateParser, styleCompiler, viewCompiler, ngModuleCompiler,
        summaryResolver, compileReflector, jitEvaluator, compilerConfig, console,
        this.getExtraNgModuleProviders.bind(this));
    this.injector = injector;
  }

  private getExtraNgModuleProviders() {
    return [this._metadataResolver.getProviderMetadata(
        new ProviderMeta(Compiler, {useValue: this}))];
  }

  compileModuleSync<T>(moduleType: Type<T>): NgModuleFactory<T> {
    return this._delegate.compileModuleSync(moduleType) as NgModuleFactory<T>;
  }
  compileModuleAsync<T>(moduleType: Type<T>): Promise<NgModuleFactory<T>> { // 注释：异步创建模块及其子组件
    return this._delegate.compileModuleAsync(moduleType) as Promise<NgModuleFactory<T>>;
  }
  compileModuleAndAllComponentsSync<T>(moduleType: Type<T>): ModuleWithComponentFactories<T> {
    const result = this._delegate.compileModuleAndAllComponentsSync(moduleType);
    return {
      ngModuleFactory: result.ngModuleFactory as NgModuleFactory<T>,
      componentFactories: result.componentFactories as ComponentFactory<any>[],
    };
  }
  compileModuleAndAllComponentsAsync<T>(moduleType: Type<T>):
      Promise<ModuleWithComponentFactories<T>> {
    return this._delegate.compileModuleAndAllComponentsAsync(moduleType)
        .then((result) => ({
                ngModuleFactory: result.ngModuleFactory as NgModuleFactory<T>,
                componentFactories: result.componentFactories as ComponentFactory<any>[],
              }));
  }
  loadAotSummaries(summaries: () => any[]) { this._delegate.loadAotSummaries(summaries); }
  hasAotSummary(ref: Type<any>): boolean { return this._delegate.hasAotSummary(ref); }
  getComponentFactory<T>(component: Type<T>): ComponentFactory<T> {
    return this._delegate.getComponentFactory(component) as ComponentFactory<T>;
  }
  clearCache(): void { this._delegate.clearCache(); }
  clearCacheFor(type: Type<any>) { this._delegate.clearCacheFor(type); }
  getModuleId(moduleType: Type<any>): string|undefined {
    const meta = this._metadataResolver.getNgModuleMetadata(moduleType);
    return meta && meta.id || undefined;
  }
}

/**
 * A set of providers that provide `JitCompiler` and its dependencies to use for
 * template compilation.
 */
export const COMPILER_PROVIDERS = <StaticProvider[]>[
  // 注释：这里也是一个核心点-编译反射器
  {provide: CompileReflector, useValue: new JitReflector()},
  // 注释：ResourceLoader- 资源加载器
  {provide: ResourceLoader, useValue: _NO_RESOURCE_LOADER},
  // 注释：jit 摘要解析器
  {provide: JitSummaryResolver, deps: []},
  // 注释：摘要解析器
  {provide: SummaryResolver, useExisting: JitSummaryResolver},
  {provide: Console, deps: []},
  // 注释：语法分析器
  {provide: Lexer, deps: []},
  // 注释：解析器器
  {provide: Parser, deps: [Lexer]},
  // 注释：基本的HTML解析器
  {
    provide: baseHtmlParser,
    useClass: HtmlParser,
    deps: [],
  },
  // 注释：国际化的HTML解析器
  {
    provide: I18NHtmlParser,
    useFactory: (parser: HtmlParser, translations: string | null, format: string,
                 config: CompilerConfig, console: Console) => {
      translations = translations || '';
      const missingTranslation =
          translations ? config.missingTranslation ! : MissingTranslationStrategy.Ignore;
      // 注释：new 国际化的HTML解析器
      return new I18NHtmlParser(parser, translations, format, missingTranslation, console);
    },
    deps: [
      baseHtmlParser,
      [new Optional(), new Inject(TRANSLATIONS)],
      [new Optional(), new Inject(TRANSLATIONS_FORMAT)],
      [CompilerConfig],
      [Console],
    ]
  },
  {
    provide: HtmlParser,
    useExisting: I18NHtmlParser,
  },
  // 注释：模板解析器
  {
    provide: TemplateParser, deps: [CompilerConfig, CompileReflector,
    Parser, ElementSchemaRegistry,
    I18NHtmlParser, Console]
  },
  { provide: JitEvaluator, useClass: JitEvaluator, deps: [] },
  // 注释：指令规范器
  { provide: DirectiveNormalizer, deps: [ResourceLoader, UrlResolver, HtmlParser, CompilerConfig]},
  // 注释：元数据解析器
  { provide: CompileMetadataResolver, deps: [CompilerConfig, HtmlParser, NgModuleResolver,
                      DirectiveResolver, PipeResolver,
                      SummaryResolver,
                      ElementSchemaRegistry,
                      DirectiveNormalizer, Console,
                      [Optional, StaticSymbolCache],
                      CompileReflector,
                      [Optional, ERROR_COLLECTOR_TOKEN]]},
  DEFAULT_PACKAGE_URL_PROVIDER,
  // 注释：样式编译器
  { provide: StyleCompiler, deps: [UrlResolver]},
  // 注释：view 编译器
  { provide: ViewCompiler, deps: [CompileReflector]},
  // 注释：NgModule编译器
  { provide: NgModuleCompiler, deps: [CompileReflector] },
  // 注释：编译器配置项目
  { provide: CompilerConfig, useValue: new CompilerConfig()},
  // 注释：JIT时，Compiler的服务供应商 CompilerImpl
  { provide: Compiler, useClass: CompilerImpl, deps: [Injector, CompileMetadataResolver,
                                TemplateParser, StyleCompiler,
                                ViewCompiler, NgModuleCompiler,
                                SummaryResolver, CompileReflector, JitEvaluator, CompilerConfig,
                                Console]},
  // 注释：DOM schema
  { provide: DomElementSchemaRegistry, deps: []},
  // 注释：Element schema
  { provide: ElementSchemaRegistry, useExisting: DomElementSchemaRegistry},
  // 注释：URL解析器
  { provide: UrlResolver, deps: [PACKAGE_ROOT_URL]},
  // 注释：指令解析器
  { provide: DirectiveResolver, deps: [CompileReflector]},
  // 注释：管道解析器
  { provide: PipeResolver, deps: [CompileReflector]},
  // 注释：模块解析器
  { provide: NgModuleResolver, deps: [CompileReflector]},
];

/**
 * @publicApi
 */
export class JitCompilerFactory implements CompilerFactory {
  private _defaultOptions: CompilerOptions[];

  /* @internal */
  constructor(defaultOptions: CompilerOptions[]) {
    const compilerOptions: CompilerOptions = {
      useJit: true,
      defaultEncapsulation: ViewEncapsulation.Emulated,
      missingTranslation: MissingTranslationStrategy.Warning,
    };

    this._defaultOptions = [compilerOptions, ...defaultOptions];
  }
  createCompiler(options: CompilerOptions[] = []): Compiler {
    const opts = _mergeOptions(this._defaultOptions.concat(options));
    const injector = Injector.create([
      COMPILER_PROVIDERS, { // 注释：编译器 Compiler 在这里被替换成 CompilerImpl 
        provide: CompilerConfig,
        useFactory: () => {
          return new CompilerConfig({
            // let explicit values from the compiler options overwrite options
            // from the app providers
            useJit: opts.useJit,
            jitDevMode: isDevMode(),
            // let explicit values from the compiler options overwrite options
            // from the app providers
            defaultEncapsulation: opts.defaultEncapsulation,
            missingTranslation: opts.missingTranslation,
            preserveWhitespaces: opts.preserveWhitespaces,
          });
        },
        deps: []
      },
      opts.providers !
    ]);
    return injector.get(Compiler);
  }
}

function _mergeOptions(optionsArr: CompilerOptions[]): CompilerOptions {
  return {
    useJit: _lastDefined(optionsArr.map(options => options.useJit)),
    defaultEncapsulation: _lastDefined(optionsArr.map(options => options.defaultEncapsulation)),
    providers: _mergeArrays(optionsArr.map(options => options.providers !)),
    missingTranslation: _lastDefined(optionsArr.map(options => options.missingTranslation)),
    preserveWhitespaces: _lastDefined(optionsArr.map(options => options.preserveWhitespaces)),
  };
}

function _lastDefined<T>(args: T[]): T|undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    if (args[i] !== undefined) {
      return args[i];
    }
  }
  return undefined;
}

function _mergeArrays(parts: any[][]): any[] {
  const result: any[] = [];
  parts.forEach((part) => part && result.push(...part));
  return result;
}
