## 引导模块

Angular 应用是模块化的，它拥有自己的模块化系统，称作 `NgModule`。 

[关于 NgModule](https://www.angular.cn/guide/architecture-modules)

一个 `NgModule` 就是一个容器，用于存放一些内聚的代码块，这些代码块专注于某个应用领域、某个工作流或一组紧密相关的功能。

它可以包含一些组件、服务提供商或其它代码文件，其作用域由包含它们的 `NgModule` 定义。 它还可以导入一些由其它模块中导出的功能，并导出一些指定的功能供其它 `NgModule` 使用。

每个 Angular 应用都至少有一个 `NgModule` 类，也就是根模块，它习惯上命名为 `AppModule`，并位于一个名叫 `app.module.ts` 的文件中。

**引导这个根模块就可以启动你的应用**。

当 bootstrap（引导）根模块之后，`NgModule` 会继而实例化元数据中 `bootstrap`。

[bootstrap 应用的主视图，称为根组件。它是应用中所有其它视图的宿主。只有根模块才应该设置这个 `bootstrap` 属性](https://www.angular.cn/api/core/NgModule#bootstrap)


## bootstrapModule

`bootstrapModule` 是在上一节 `platformBrowserDynamic()` 返回的平台实例 `PlatformRef` 中的一个方法，用于引导启动实例根模块。

> angular/packages/core/src/application_ref.ts

```typescript
/**
 * Creates an instance of an `@NgModule` for a given platform using the given runtime compiler.
 *
 * @usageNotes
 * ### Simple Example
 *
 * ```typescript
 * @NgModule({
 *   imports: [BrowserModule]
 * })
 * class MyModule {}
 *
 * let moduleRef = platformBrowser().bootstrapModule(MyModule);
 * ```
 *
 */
bootstrapModule<M>(moduleType: Type<M>, compilerOptions: (CompilerOptions&BootstrapOptions)| Array<CompilerOptions&BootstrapOptions> = []):Promise<NgModuleRef<M>> {
  const options = optionsReducer({}, compilerOptions);
  return compileNgModuleFactory(this.injector, options, moduleType)
      .then(moduleFactory => this.bootstrapModuleFactory(moduleFactory, options));
}
```

`bootstrapModule` 接受2个参数：

1. `moduleType: Type<M>` 根模块
2. `compilerOptions: (CompilerOptions&BootstrapOptions)| Array<CompilerOptions&BootstrapOptions> = []` 编译器选项，默认是空数组

这里有个很有意思的 typescript 写法：`Type<M>`：

> angular/packages/core/src/interface/type.ts

```typescript
export interface Type<T> extends Function { new (...args: any[]): T; }
```

接口 `Type` 继承 `Function` ，其实 **`Type<T>` 可以说是 `class` 的类型**。

在这里，`bootstrapModule` ：

1. 首先通过 `optionsReducer` 递归 reduce **将编译器选项 `compilerOptions` 拍平为对象**。
2. 然后调用了 `compileNgModuleFactory` 传入平台实例的注射器 `injector` ，编译器选项和要引导实例化的根模块。 


## compileNgModuleFactory

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
```

`compileNgModuleFactory` 在这里其实就是 `compileNgModuleFactory__PRE_R3__`

1. 在这里，先**通过平台实例 `PlatformRef` 的注射器 `injector` 获取了编译器实例，其实也就是 `coreDynamic` 提供的 `JitCompilerFactory`**
2. 然后调用 JIT 编译器 `JitCompilerFactory` 的 `createCompiler` 方法，创建编译器 `Compiler` 实例 `CompilerImpl`
3. 最后通过编译器 `Compiler` 实例 `CompilerImpl` **异步编译给定的 `NgModule` 及其所有组件**

`coreDynamic` 提供的 `JitCompilerFactory` 调用 `createCompiler` 创建编译器实例的时候，其实是在这里注入了服务供应商 `CompilerImpl`，

**所以最后创建了的编译器实例 `Compiler` 其实是 `CompilerImpl`**。

> angular/packages/platform-browser-dynamic/src/compiler_factory.ts

```typescript
{ provide: Compiler, useClass: CompilerImpl, deps: [Injector, CompileMetadataResolver....]}
```


## CompilerImpl

> angular/packages/platform-browser-dynamic/src/compiler_factory.ts

```typescript
export class CompilerImpl implements Compiler {
  private _delegate: JitCompiler;
  public readonly injector: Injector;
  constructor(
      injector: Injector, private _metadataResolver: CompileMetadataResolver,
      templateParser: TemplateParser, styleCompiler: StyleCompiler, viewCompiler: ViewCompiler,
      ngModuleCompiler: NgModuleCompiler, summaryResolver: SummaryResolver<Type<any>>,
      compileReflector: CompileReflector, jitEvaluator: JitEvaluator,
      compilerConfig: CompilerConfig, console: Console) {
    this._delegate = new JitCompiler(
        _metadataResolver, templateParser, styleCompiler, viewCompiler, ngModuleCompiler,
        summaryResolver, compileReflector, jitEvaluator, compilerConfig, console,
        this.getExtraNgModuleProviders.bind(this));
    this.injector = injector;
  }

  compileModuleAsync<T>(moduleType: Type<T>): Promise<NgModuleFactory<T>> {
    return this._delegate.compileModuleAsync(moduleType) as Promise<NgModuleFactory<T>>;
  }
}
```

所以 `compileNgModuleFactory` 在异步创建模块和组件  `compiler.compileModuleAsync(moduleType)` 时，其实调用的是 `CompilerImpl` 实例 的 `compileModuleAsync`。

而在 JTT 编译器实例化的时候，会实例一个 `JitCompiler`，所以实际上**异步创建模块和组件这个方法具体是由 `JitCompiler` 实例的方法 `compileModuleAsync` 执行**的：

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
      private getExtraNgModuleProviders: (ngModule: any) => CompileProviderMetadata[]) {}

  compileModuleSync(moduleType: Type): object {
    return SyncAsync.assertSync(this._compileModuleAndComponents(moduleType, true));
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
}
```

`compileModuleSync` 创建了一个 `promise`，然后调用了 `_compileModuleAndAllComponents`。

这里逻辑比较复杂，大概讲下，具体的大家可以看 angular 的源代码，很好理解：

1. 私有方法 `_compileModuleAndAllComponents` 先**调用了 `this._loadModules` ，异步加载解析主模块，也就是 `bootstrapModule` 的 `ngModule`**
2. 在异步加载主模块之后，执行后面的回调函数，**编译主模块上的所有组件**



## 总结

