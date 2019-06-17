[直接看人话总结](#总结)

## angular 模块

[官方介绍](https://www.angular.cn/guide/ngmodules)

`NgModule` 是一个带有 `@NgModule` 装饰器的类。 

`@NgModule` 的参数是一个元数据对象，用于描述如何编译组件的模板，以及如何在运行时创建注入器。

它会标出该模块自己的组件、指令和管道，通过 `exports` 属性公开其中的一部分，以便外部组件使用它们。

`NgModule` 还能把一些服务提供商添加到应用的依赖注入器中。

在之前的例子中，我们通过 `platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));` **引导初始化时，`bootstrapModule` 方法传入的第一个参数就是angular 模块 `NgModule`**。

这里我们要先讲2个概念：JIT 和 AOT

### JIT和AOT

Angular 提供了两种方式来编译你的应用：

1. 即时编译 (JIT  Just-In-Time)，它会在运行期间在浏览器中编译你的应用
2. 预先（AOT Ahead-Of-Time）编译，它会在构建时编译你的应用

- JIT的流程
  - 编译时
    1. 运行 ngc（angular 封装的 tsc） 编译 TypeScript 代码为 JavaScript 并提取元数据
    2. 构建项目，做些代码打包、混淆、压缩
    3. 部署应用
  - 浏览器运行时
    1. 浏览器下载 JavaScript 代码
    2. 启动 angular 应用
    3. angular 启动 jit 编译模式，编译指令组件模块提取 ngc 编译出元数据
    4. 创建各种指令组件模块的实例，产生视图

- AOT的流程
  - 代码分析阶段
    1. 运行 ngc（angular 封装的 tsc） 编译应用源代码输出编译出的 angular 目标 Typescript 代码并**AOT 收集器（collector）**记录 Angular 装饰器中的元数据 `.metadata.json` 文件
    2. ngc 调用 tsc 将目标 Typescript 代码编译成 Javascript 代码
    3. 摇树优化(Tree shaking)
    4. 构建项目，做些代码打包、混淆、压缩
    5. 部署应用
  -  浏览器运行时
    1. 浏览器下载 JavaScript 代码
    2. 启动 angular 应用，产生视图

[参考](https://www.angular.cn/guide/aot-compiler#how-aot-works)

**但这里我们只讨论 JIT 模式！**


## @NgModule

> angular/packages/core/src/metadata/ng_module.ts

```typescript
export interface NgModuleDecorator {
  (obj?: NgModule): TypeDecorator;
  new (obj?: NgModule): NgModule;
}

export interface NgModule {
  providers?: Provider[];
  declarations?: Array<Type<any>|any[]>;
  imports?: Array<Type<any>|ModuleWithProviders<{}>|any[]>;
  exports?: Array<Type<any>|any[]>;
  entryComponents?: Array<Type<any>|any[]>;
  bootstrap?: Array<Type<any>|any[]>;
  schemas?: Array<SchemaMetadata|any[]>;
  id?: string;
  jit?: true;
}

/**
 * @Annotation
 * @publicApi
 */
export const NgModule: NgModuleDecorator = makeDecorator(
    'NgModule', (ngModule: NgModule) => ngModule, undefined, undefined,
    /**
     * Decorator that marks the following class as an NgModule, and supplies
     * configuration metadata for it.
     *
     * * The `declarations` and `entryComponents` options configure the compiler
     * with information about what belongs to the NgModule.
     * * The `providers` options configures the NgModule's injector to provide
     * dependencies the NgModule members.
     * * The `imports` and `exports` options bring in members from other modules, and make
     * this module's members available to others.
     */
    (type: NgModuleType, meta: NgModule) => SWITCH_COMPILE_NGMODULE(type, meta));
```

装饰器 `@NgModule` 的作用是描述 angular 模块，并提供 [元数据](http://blog.wolksoftware.com/decorators-metadata-reflection-in-typescript-from-novice-to-expert-part-4) 支持

例如几个常用的元数据：

1. `providers?: Provider[];` 依赖注入系统提供可注入项的重点
   1. **非懒加载模块定义的 `providers` 可以提供给全局任何指令管道服务**，相当于 `@Injectable` 为 `root`
   2. 懒加载的模块**有自己的注入器，通常是 app root 注入器的子注入器**，在**懒加载模块内为单例服务**
2. `declarations` 属于此模块的组件，指令和管道的集合
3. `imports` 引入其他模块的 `export`
4. `exports` 到处给其他模块的 `imports`
5. `bootstrap` 引导用的入口组件，通常**根模块和路由懒加载需要设置**
6. `entryComponents` [入口组件](https://www.angular.cn/guide/entry-components#the-entrycomponents-array) 不常用，angular 编译器会自动将 `bootstrap` 编译到里面

而 `@NgModule` 由 `makeDecorator` 构造而来：

### makeDecorator创建装饰器

`makeDecorator` 用来创建 angular 装饰器，像 `@NgModule` `@Component` `@Pipe` `@Directive` 都用改方法创建：

> angular/packages/core/src/util/decorators.ts

```typescript
export const ANNOTATIONS = '__annotations__';

export function makeDecorator<T>(
    name: string, 
    props?: (...args: any[]) => any, // 注释：args 就是装饰器的参数用来处理装饰器参数
    parentClass?: any,
    additionalProcessing?: (type: Type<T>) => void, // 注释：额外的处理
    typeFn?: (type: Type<T>, ...args: any[]) => void) // 注释：用来处理class的原型
: {new (...args: any[]): any; (...args: any[]): any; (...args: any[]): (cls: any) => any;} {
  const metaCtor = makeMetadataCtor(props); // 注释：创建 Metadata 的构造函数

  function DecoratorFactory(...args: any[]): (cls: Type<T>) => any {
    if (this instanceof DecoratorFactory) { // 注释：通过 args 用来设置默认值 
      metaCtor.call(this, ...args); // 注释：this就是DecoratorFactory工厂，也就是参数对象
      return this;
    }

    const annotationInstance = new (DecoratorFactory as any)(...args); // 注释：注解实例实际上就是装饰器的参数对象
    return function TypeDecorator(cls: Type<T>) { // 注释：cls就是装饰器装饰的类构造函数
      if (typeFn) typeFn(cls, ...args);
      // Use of Object.defineProperty is important since it creates non-enumerable property which
      // prevents the property is copied during subclassing.
      const annotations = cls.hasOwnProperty(ANNOTATIONS) ?
          (cls as any)[ANNOTATIONS] :
          Object.defineProperty(cls, ANNOTATIONS, {value: []})[ANNOTATIONS];
      annotations.push(annotationInstance); // 注释：将装饰器的处理结果存在

      if (additionalProcessing) additionalProcessing(cls);

      return cls;
    };
  }

  if (parentClass) {
    DecoratorFactory.prototype = Object.create(parentClass.prototype); // 注释：使实例 DecoratorFactory 继承继承 parentClass
  }

  DecoratorFactory.prototype.ngMetadataName = name; // 注释：装饰器名称会被放在原型属性 ngMetadataName 上
  (DecoratorFactory as any).annotationCls = DecoratorFactory;
  return DecoratorFactory as any;
}

function makeMetadataCtor(props?: (...args: any[]) => any): any {
  return function ctor(...args: any[]) {
    if (props) {
      const values = props(...args);
      for (const propName in values) {
        this[propName] = values[propName];
      }
    }
  };
}
```

参数：
1. `name: string` 就是装饰器的名称
2. `props?: (...args: any[]) => any` `args` 就是装饰器的参数，`props` 用来处理装饰器参数，**可用于默认值设置**
3. `parentClass?: any` 父类，提供给 `DecoratorFactory` 实例用来继承
4. `additionalProcessing?: (type: Type<T>) => void` 对类构造函数进行额外处理，**参数是装饰器的宿主类的构造函数**
5. `typeFn?: (type: Type<T>, ...args: any[]) => void)` 在装饰器的返回函数中，会再次执行下回调函数，参数是**类构造函数和参数**

在这里 `makeDecorator` 基本上做了这几个事情：

1. 通过 `makeMetadataCtor` 创建一个**给类构造函数附加初始值的函数** ，本质上是**创建 Metadata 的构造函数**
2. 如果 `this` 是注解工厂 `DecoratorFactory` 的实例，则通过上面给类构造函数附加初始值的函数，传入 `this` 和装饰器参数 `args`
3. 此外则先执行 `typeFn` 传入类构造函数和参数，修改类构造函数
4. 先传入**参数创建注解工厂 `DecoratorFactory` 的实例** ，注解工厂方法会递归执行，直到 `this` 是注解工厂 `DecoratorFactory` 的实例 （**注解工厂 `DecoratorFactory` 的实例实际上就是装饰器的参数对象**）
5. 判断类构造函数是否存在 `__annotations__：any[]` 属性，把**装饰器处理结果（注解实例===参数对象）保存在类构造函数的 `__annotations__：any[]` 属性数组中**，并提供给编译器 `compiler` 使用
6. 最后通过处理 `DecoratorFactory` 的原型，继承父类 `parentClass` 并添加元数据的名字 `ngMetadataName` 

注意这里：`DecoratorFactory.prototype = Object.create(parentClass.prototype);` 

**通过使用 `Object.create` 避免执行一次 `parentClass` 来继承父类**

### @NgModule总结

1. 实际上，`makeDecorator` 的作用就是**构造返回一个函数 `DecoratorFactory`**用作 [装饰器](https://www.tslang.cn/docs/handbook/decorators.html)，并**创建装饰器工厂 `DecoratorFactory` 实例**
2. 其实，我觉得 `@NgModule` 就是一个接受参数并返回函数的方法，**装饰器会把 `@NgModule` 传入的元数据对象进行处理并生成注解工厂 `DecoratorFactory` 的实例挂在到 `__annotations__：any` 提供给编译器使用**。

划重点：`AppModule.__annotations__`：

最后大家可以**打印下 `(AppModule as any).__annotations__` 来进行验证**，这就是存在模块类上的注解实例。

![AppModule.__annotations__](https://user-gold-cdn.xitu.io/2019/6/17/16b650a1f8be48ef?imageView2/0/w/1280/h/960/format/webp/ignore-error/1)
<!-- ![AppModule.__annotations__](https://raw.githubusercontent.com/DimaLiLongJi/read-angular/master/docs/img/annotations.png) -->


## 编译模块

**此处建议结合[第二章bootstrapModule](/#/bootstrapModule)一起阅读**

### JIT编译器的服务

先看下之前构建的 `JitCompilerFactory` 时注入过的服务，这些在后面编译的时候会大量用到：

> angular/packages/platform-browser-dynamic/src/compiler_factory.ts

```typescript
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
```



讲完了 `@NgModule`，回到之前的文章，看下 `bootstrapModule` 这个方法如何编译模块：

> angular/packages/core/src/application_ref.ts

```typescript
let compileNgModuleFactory:
    <M>(injector: Injector, options: CompilerOptions, moduleType: Type<M>) =>
        Promise<NgModuleFactory<M>> = compileNgModuleFactory__PRE_R3__;

function compileNgModuleFactory__PRE_R3__<M>(
    injector: Injector, options: CompilerOptions,
    moduleType: Type<M>): Promise<NgModuleFactory<M>> {
  const compilerFactory: CompilerFactory = injector.get(CompilerFactory);
  const compiler = compilerFactory.createCompiler([options]);
  return compiler.compileModuleAsync(moduleType);
}

@Injectable()
export class PlatformRef {
    ...
   bootstrapModule<M>(moduleType: Type<M>, compilerOptions: (CompilerOptions&BootstrapOptions)| Array<CompilerOptions&BootstrapOptions> = []):Promise<NgModuleRef<M>> {
   const options = optionsReducer({}, compilerOptions);
    return compileNgModuleFactory(this.injector, options, moduleType)
        .then(moduleFactory => this.bootstrapModuleFactory(moduleFactory, options));
   }
   ...
}
```

`bootstrapModule` 调用了 `compileNgModuleFactory` 这个方法，而最后其实在 JIT 模式下，其实**是 `coreDynamic` 提供的 `JitCompilerFactory` 创建了 `CompilerImpl` 实例并创建了代理 `JitCompiler` 去实现真正的编译**。

> angular/packages/platform-browser-dynamic/src/compiler_factory.ts

```typescript
export class CompilerImpl implements Compiler {
  ...
  private _delegate: JitCompiler;
  ...
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
  }
  compileModuleAsync<T>(moduleType: Type<T>): Promise<NgModuleFactory<T>> { // 注释：异步创建模块及其子组件
    return this._delegate.compileModuleAsync(moduleType) as Promise<NgModuleFactory<T>>;
  }
  ...
}
```

**最终由 `JitCompiler` 执行 `compileModuleAsync` 方法编译模块**

### JitCompiler

编译模块和组件的实际工作是由 `CompilerImpl` 交由代理 `JitCompiler` 的方法 `compileModuleAsync<T>(moduleType: Type<T>)` 完成的：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
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
      private getExtraNgModuleProviders: (ngModule: any) => CompileProviderMetadata[]) {
        ...
      }
  ...
  compileModuleAsync(moduleType: Type): Promise<object> {
    // 注释：其实 JTI 编译在这步做的
    return Promise.resolve(this._compileModuleAndComponents(moduleType, false));
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
  ...
}
```

结合第二章引导模块总结下：

`compileModuleAsync` 在这里只做了三件事：

1. 加载模块 `this._loadModules`
2. 编译组件 `this._compileComponents`
3. 编译模块 `this._compileModule`

### _loadModules加载模块

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
  ...
  // 注释：异步加载解析主模块，也就是 bootstrap 的 ngModule
  private _loadModules(mainModule: any, isSync: boolean): SyncAsync<any> {
    const loading: Promise<any>[] = [];
    // 注释：从元数据中获得根模块的 __annotations__ 并格式化
    const mainNgModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    // 注释：过滤 AOT 模块并异步编加载数据中全部指令组件和和管道
    // 注释：过滤掉根模块元数据中的 AOT 模块
    this._filterJitIdentifiers(mainNgModule.transitiveModule.modules).forEach((nestedNgModule) => {
      // getNgModuleMetadata only returns null if the value passed in is not an NgModule
      const moduleMeta = this._metadataResolver.getNgModuleMetadata(nestedNgModule) !;
      this._filterJitIdentifiers(moduleMeta.declaredDirectives).forEach((ref) => {
        // 注释：异步编加载数据中全部指令组件和和管道
        const promise =
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
  ...

  // 注释：过滤掉根模块元数据中的 AOT 模块
  hasAotSummary(ref: Type) { return !!this._summaryResolver.resolveSummary(ref); }

  // 注释：过滤掉根模块元数据中的 AOT 模块
  private _filterJitIdentifiers(ids: CompileIdentifierMetadata[]): any[] {
    return ids.map(mod => mod.reference).filter((ref) => !this.hasAotSummary(ref));
  }
}
```

`_loadModules` 接受2个参数：

1. `mainModule: any` 模块类
2. `isSync: boolean` 是否是同步加载 在 `bootstrapModule` 的时候是 `false`，异步加载

`_loadModules` 做了什么？

1. 首先通过 `this._metadataResolver.getNgModuleMetadata` 获取到之前 `makeDecorator` 在模块类上创建的**静态属性 `__annotations__` 并编译模块的元数据**
2. 调用 `this._filterJitIdentifiers` **递归过滤掉 AOT 模块**
3. 调用 `this._metadataResolver.loadDirectiveMetadata(moduleMeta.type.reference, ref, isSync)` **异步加载全部指令组件和和管道的元数据**
4. 全部并行 `Promise` 并返回异步编译的结果
5. 最后所有被导入 `AppModule` 关联的模块的元数据都已经加载进了缓存中，包括了**从 `AppModule` 开始除了懒加载模块之外的的整个模块树，树上的所有指令，组件和管道，以及所有的服务**。

接下来继续看 `_compileModuleAndComponents` 在加载完模块之后，调用了 `this._compileComponents` 编译组件：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
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
}
```

### _compileComponents编译组件

`_compileComponents` 方法用来编译根模块组件的模板：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
  // 注释：编译主模块上的所有组件
  // 主要目的：拿到被声明的组件的模板、入口组件的模板，最终拿到了所有涉及的模板，放在 templates 中
  _compileComponents(mainModule: Type, allComponentFactories: object[]|null) {
    // 注释：获取主模块
    const ngModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    const moduleByJitDirective = new Map<any, CompileNgModuleMetadata>();
    const templates = new Set<CompiledTemplate>();

    // 注释：过滤AOT模块
    const transJitModules = this._filterJitIdentifiers(ngModule.transitiveModule.modules);

    // 注释：编译各个模块的模板，（localMod 是模块的class）
    transJitModules.forEach((localMod) => {
      const localModuleMeta = this._metadataResolver.getNgModuleMetadata(localMod) !;
      // 注释：指令和组件都是 declaredDirectives (在angular里 @Component组件 继承了 指令@Directive)
      this._filterJitIdentifiers(localModuleMeta.declaredDirectives).forEach((dirRef) => {
        moduleByJitDirective.set(dirRef, localModuleMeta);
        const dirMeta = this._metadataResolver.getDirectiveMetadata(dirRef);
        // 注释：只编译组件
        // 注释：拿到所有的模板，并放在 templates：Set 中
        if (dirMeta.isComponent) {
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

    // 注释：编译入口组件的模板
    transJitModules.forEach((localMod) => {
      const localModuleMeta = this._metadataResolver.getNgModuleMetadata(localMod) !;
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
      localModuleMeta.entryComponents.forEach((entryComponentType) => {
        if (!this.hasAotSummary(entryComponentType.componentType)) {
          const moduleMeta = moduleByJitDirective.get(entryComponentType.componentType) !;
          templates.add(
              this._createCompiledHostTemplate(entryComponentType.componentType, moduleMeta));
        }
      });
    });

    // 注释：执行 _compileTemplate 编译模板
    templates.forEach((template) => this._compileTemplate(template));
  }
}
```

在这里主要做了下面这几件事：

1. `this._metadataResolver.getNgModuleMetadata` 像之前编译模板一样获取根模块
2. `this._filterJitIdentifiers` 过滤 AOT 模块
3. 第一次遍历，找出所有从根模块开始的模块树上被声明的组件（`declarations`），并编译其模板
4. 第二次遍历，找出所有从根模块开始的模块树上入口的组件（`entryComponents`），并编译其模板
5. 最后编译所有模板

至于如何编译的模板，之后讲组件的时候再说吧。

`_compileComponents` 的**目的是拿到被声明的组件的模板、入口组件的模板，最终拿到了所有涉及的模板**

### _compileModule编译模块

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
  ...
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
      // 注释：构建编译结果：是一个对象，只有 ngModuleFactoryVar 这么一个属性：ngModuleFactoryVar: "AppModuleNgFactory"，内部通过构建服务供应商和模块的AST，很复杂
      const compileResult = this._ngModuleCompiler.compile(outputCtx, moduleMeta, extraProviders);
      console.log(77777, moduleType, compileResult);
      // 注释：动态创建出一个模块的工厂方法
      ngModuleFactory = this._interpretOrJit(
          ngModuleJitUrl(moduleMeta), outputCtx.statements)[compileResult.ngModuleFactoryVar];
      this._compiledNgModuleCache.set(moduleMeta.type.reference, ngModuleFactory);
    }
    return ngModuleFactory;
  }
  ...
}
```

这里也很简单：

1. 先从从缓存拿到模块工厂函数
2. 如果不存在工厂函数，则开始创建
3. 读取模块的元数据
4. 调用实例化 `JITCompiler` 时候传入方法，创建**额外的模块服务供应商** （在 `CompilerImpl` 传入）
5. 创建输出上下
6. 构建编译结果：是一个对象，**只有 `ngModuleFactoryVar` 这么一个属性，估计是把编译结果放缓存了**：`ngModuleFactoryVar: "AppModuleNgFactory"`
7. 动态创建出一个模块的工厂方法并返回

## NgModuleCompiler模块编译器

模块编译器这里比较复杂：

> angular/packages/compiler/src/ng_module_compiler.ts

```typescript
export class NgModuleCompiler {
  constructor(private reflector: CompileReflector) {}

  compile(
      ctx: OutputContext, ngModuleMeta: CompileNgModuleMetadata,
      extraProviders: CompileProviderMetadata[]): NgModuleCompileResult {
    // 注释：生成一个关于模块类及文件位置的对象
    const sourceSpan = typeSourceSpan('NgModule', ngModuleMeta.type);
    // 注释：获得入口组件的工厂函数，默认就有 <ng-component/> 和 <app-root/>
    const entryComponentFactories = ngModuleMeta.transitiveModule.entryComponents;
    const bootstrapComponents = ngModuleMeta.bootstrapComponents;
    // 注释：分析模块及模块引入的模块的服务供应商
    const providerParser =
        new NgModuleProviderAnalyzer(this.reflector, ngModuleMeta, extraProviders, sourceSpan);
    // 注释：这块是AST了，生成了模块中所有服务供应商的函数 AST
    const providerDefs =
        [componentFactoryResolverProviderDef(
             this.reflector, ctx, NodeFlags.None, entryComponentFactories)]
            .concat(providerParser.parse().map((provider) => providerDef(ctx, provider)))
            .map(({providerExpr, depsExpr, flags, tokenExpr}) => {
              return o.importExpr(Identifiers.moduleProviderDef).callFn([
                o.literal(flags), tokenExpr, providerExpr, depsExpr
              ]);
            });
    
    // 注释：这块是AST了，生成了模块的 AST
    const ngModuleDef = o.importExpr(Identifiers.moduleDef).callFn([o.literalArr(providerDefs)]);
    const ngModuleDefFactory = o.fn(
        [new o.FnParam(LOG_VAR.name !)], [new o.ReturnStatement(ngModuleDef)], o.INFERRED_TYPE);

    // 注释：创建一个字符串
    const ngModuleFactoryVar = `${identifierName(ngModuleMeta.type)}NgFactory`;
    // 注释：保存在上下文中声明中
    this._createNgModuleFactory(
        ctx, ngModuleMeta.type.reference, o.importExpr(Identifiers.createModuleFactory).callFn([
          ctx.importExpr(ngModuleMeta.type.reference),
          o.literalArr(bootstrapComponents.map(id => ctx.importExpr(id.reference))),
          ngModuleDefFactory
        ]));
    if (ngModuleMeta.id) {
      const id = typeof ngModuleMeta.id === 'string' ? o.literal(ngModuleMeta.id) :
                                                       ctx.importExpr(ngModuleMeta.id);
      const registerFactoryStmt = o.importExpr(Identifiers.RegisterModuleFactoryFn)
                                      .callFn([id, o.variable(ngModuleFactoryVar)])
                                      .toStmt();
      // 注释：保存在上下文中
      ctx.statements.push(registerFactoryStmt);
    }
    // 注释：返回编译结果
    return new NgModuleCompileResult(ngModuleFactoryVar);
  }
  ...
}
```

这里做了下面几件事情：

1. 生成一个关于模块类及文件位置的对象
2. 获得入口组件的工厂函数，默认就有 `<ng-component/>` 和 `<app-root/>`
3. 分析**模块及模块引入的模块的服务供应商（provide）**，并**生成对应的函数 AST**
   ![provide-ast](https://raw.githubusercontent.com/DimaLiLongJi/read-angular/master/docs/img/provide-ast.png)
4. 生成模块的 AST
5. 最后通过把编译结果保存在上下文中返回一个作为 token 的对象

**其实我没太看懂为什么要转换为 AST，这里面留几个坑**


## 总结

总结下 `@NgModule` 大概发生了什么

1. 在初始化的时候，通过 `makeDecorator` 生成 `@NgModule` 注解
2. `@NgModule` 通过传入的参数和反射，生成注解附加在模块类的静态属性 `__annotations__` 并提供给 `JitCompiler` 编译器使用
3. 当 `bootstrapModule` 被调用时候，在 JIT 模式下**创建了代理 `JitCompiler` 去实现真正的编译**
4. `JitCompiler` 编译模块调用了 `compileModuleAsync` 并**返回模块工厂**，并且只做了三件事：
   1. **加载模块** `this._loadModules`
   2. **编译组件** `this._compileComponents`
   3. **编译模块** `this._compileModule`
