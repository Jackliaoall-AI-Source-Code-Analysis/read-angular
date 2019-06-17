[直接看人话总结](#总结)

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
@Injectable()
export class PlatformRef {
  ...
  bootstrapModule<M>(
      moduleType: Type<M>, compilerOptions: (CompilerOptions&BootstrapOptions)|
      Array<CompilerOptions&BootstrapOptions> = []): Promise<NgModuleRef<M>> {
    // 注释：bootstrapModule` 首先通过 `optionsReducer` 递归 reduce 将编译器选项 `compilerOptions` 拍平为对象
    const options = optionsReducer({}, compilerOptions);
    // 注释：这里获取到编译后的模块工厂，然后返回给 bootstrapModuleFactory创建模块
    return compileNgModuleFactory(this.injector, options, moduleType)
        .then(moduleFactory => this.bootstrapModuleFactory(moduleFactory, options));
  }
  ...
}
```

`bootstrapModule` 接受2个参数：

1. `moduleType: Type<M>` 根模块
2. `compilerOptions: (CompilerOptions&BootstrapOptions)| Array<CompilerOptions&BootstrapOptions> = []` 编译器选项，默认是空数组

### Type<M>

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
  // 注释：其实就是平台coreDynamic 的服务商 JitCompilerFactory
  const compilerFactory: CompilerFactory = injector.get(CompilerFactory);
  // 注释：调用 JitCompilerFactory 创建编译器实例 CompilerImpl
  const compiler = compilerFactory.createCompiler([options]);
  // 注释：异步创建 ngmodule 模块工厂 （CompilerImpl 通过代理 CompilerImpl 去编译）
  return compiler.compileModuleAsync(moduleType);
}
```

`compileNgModuleFactory` 在这里其实就是 `compileNgModuleFactory__PRE_R3__`

1. 在这里，先**通过平台实例 `PlatformRef` 的注射器 `injector` 获取了编译器实例，其实也就是 `coreDynamic` 提供的 `JitCompilerFactory`**
2. 然后调用 JIT 编译器工厂 `JitCompilerFactory` 的 `createCompiler` 方法，创建编译器 `Compiler` 实例 `CompilerImpl`
3. 最后通过编译器 `Compiler` 实例 `CompilerImpl` **异步编译给定的 `NgModule` 及其所有组件**

`coreDynamic` 提供的 `JitCompilerFactory` 调用 `createCompiler` **创建编译器实例 `Compiler` 的时候，其实是在这里注入的服务供应商 `CompilerImpl`**，

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
    // 注释：创建 JIT 编译器
    this._delegate = new JitCompiler(
        _metadataResolver, templateParser, styleCompiler, viewCompiler, ngModuleCompiler,
        summaryResolver, compileReflector, jitEvaluator, compilerConfig, console,
        this.getExtraNgModuleProviders.bind(this));
    this.injector = injector;
  }
  ...
  // 注释：异步创建模块及其子组件
  compileModuleAsync<T>(moduleType: Type<T>): Promise<NgModuleFactory<T>> {
    return this._delegate.compileModuleAsync(moduleType) as Promise<NgModuleFactory<T>>;
  }
  ...
}
```

所以 `compileNgModuleFactory` 在异步创建模块工厂和组件  `compiler.compileModuleAsync(moduleType)` 时，其实调用的是 `CompilerImpl` 实例 的 `compileModuleAsync`。

而在 JTT 编译器实例化的时候，会实例一个 `JitCompiler` 当做代理去编译，所以实际上**异步创建模块工厂和组件这个方法具体是由 `JitCompiler` 实例的方法 `compileModuleAsync` 执行**的：

### JitCompilerJIT编译器

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

  compileModuleAsync(moduleType: Type): Promise<object> {
    // 注释：其实 JTI 编译在这步做的，异步编译模块和组件
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
}
```

`compileModuleAsync` 调用了 `_compileModuleAndComponents`，并返回一个 `Promise`。

这里逻辑比较复杂，大概讲下，**具体的在后面 angular模块 的时候再详细讲解**，很好理解：

1. **加载模块**：私有方法 `_compileModuleAndComponents` 先**调用了 `this._loadModules`**，异步加载解析主模块，也就是 `bootstrapModule` 的 `ngModule`
2. **编译组件**：在异步加载主模块之后，执行后面的回调函数，通过私有方法 `_compileComponents` **编译主模块上的所有组件**，并通过 `_compileTemplate` 编译模板（这步先跳过，后面讲到编译组件的时候会讲）
3. **编译模块**：最后通过私有方法 `_compileModule` 返回value 是编译过的模块工厂的 `Promise`
4. `Promise` 会调用下面的异步方法 `then(moduleFactory => this.bootstrapModuleFactory(moduleFactory, options))`

### 两次导入同一个模块

这里**有个地方也很有意思**，官网上的[模块常见问题](https://www.angular.cn/guide/ngmodule-faq)上有这样的一个问题：

[如果我两次导入同一个模块会怎么样？](https://www.angular.cn/guide/ngmodule-faq#what-if-i-import-the-same-module-twice)

答案里有一句：当三个模块全都导入模块'A'时，Angular 只会首次遇到时加载一次模块'A'，之后就不会这么做了，之前一直不知道为什么，这次看到了这样的一段代码：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
   ...
   private _compileModule(moduleType: Type): object {
     // 注释：从缓存中获得编译过的模块
    let ngModuleFactory = this._compiledNgModuleCache.get(moduleType) !;
    if (!ngModuleFactory) {
      const moduleMeta = this._metadataResolver.getNgModuleMetadata(moduleType) !;
      // Always provide a bound Compiler
      const extraProviders = this.getExtraNgModuleProviders(moduleMeta.type.reference);
      const outputCtx = createOutputContext();
      const compileResult = this._ngModuleCompiler.compile(outputCtx, moduleMeta, extraProviders);
      ngModuleFactory = this._interpretOrJit(
          ngModuleJitUrl(moduleMeta), outputCtx.statements)[compileResult.ngModuleFactoryVar];
      this._compiledNgModuleCache.set(moduleMeta.type.reference, ngModuleFactory);
    }
    return ngModuleFactory;
   }
   ...
}
```

**angular 会用 `Map` 缓存模块，并且在需要返回编译的模块工厂时，优先去缓存中寻找已经被编译过的模块**


## bootstrapModuleFactory

> angular/packages/core/src/application_ref.ts

```typescript
@Injectable()
export class PlatformRef {
  ...
  bootstrapModule<M>(
      moduleType: Type<M>, compilerOptions: (CompilerOptions&BootstrapOptions)|
      Array<CompilerOptions&BootstrapOptions> = []): Promise<NgModuleRef<M>> {
    // 注释：bootstrapModule` 首先通过 `optionsReducer` 递归 reduce 将编译器选项 `compilerOptions` 拍平为对象
    const options = optionsReducer({}, compilerOptions);
    // 注释：这里获取到编译后的模块工厂，然后返回给 bootstrapModuleFactory创建模块
    return compileNgModuleFactory(this.injector, options, moduleType)
        .then(moduleFactory => this.bootstrapModuleFactory(moduleFactory, options));
  }
  ...
}
```

回一下上面，`bootstrapModule` 方法调用了 `compileNgModuleFactory` 返回一个 value 是 `ngModuleFactory` 模块工厂的 `Promise`，

接下来在 `Promise` 的 `then` 方法里调用了 `bootstrapModuleFactory`。

### bootstrapModuleFactory引导模块的工厂方法

> angular/packages/core/src/application_ref.ts

```typescript
@Injectable()
export class PlatformRef {
  ...
   bootstrapModuleFactory<M>(moduleFactory: NgModuleFactory<M>, options?: BootstrapOptions):
      Promise<NgModuleRef<M>> {
    // Note: We need to create the NgZone _before_ we instantiate the module,
    // as instantiating the module creates some providers eagerly.
    // So we create a mini parent injector that just contains the new NgZone and
    // pass that as parent to the NgModuleFactory.
    const ngZoneOption = options ? options.ngZone : undefined;
    const ngZone = getNgZone(ngZoneOption);
    const providers: StaticProvider[] = [{provide: NgZone, useValue: ngZone}];
    // Attention: Don't use ApplicationRef.run here,
    // as we want to be sure that all possible constructor calls are inside `ngZone.run`!
    return ngZone.run(() => {
      const ngZoneInjector = Injector.create(
          {providers: providers, parent: this.injector, name: moduleFactory.moduleType.name});
      const moduleRef = <InternalNgModuleRef<M>>moduleFactory.create(ngZoneInjector);
      const exceptionHandler: ErrorHandler = moduleRef.injector.get(ErrorHandler, null);
      if (!exceptionHandler) {
        throw new Error('No ErrorHandler. Is platform module (BrowserModule) included?');
      }
      moduleRef.onDestroy(() => remove(this._modules, moduleRef));
      ngZone !.runOutsideAngular(
          () => ngZone !.onError.subscribe(
              {next: (error: any) => { exceptionHandler.handleError(error); }}));
      return _callAndReportToErrorHandler(exceptionHandler, ngZone !, () => {
        const initStatus: ApplicationInitStatus = moduleRef.injector.get(ApplicationInitStatus);
        initStatus.runInitializers();
        return initStatus.donePromise.then(() => {
          this._moduleDoBootstrap(moduleRef);
          return moduleRef;
        });
      });
    });
   }
   ...
}
```

这里做的事情也不多：

1. 首先获判断下是否存在配置，**默认我们启动的时候没有配置**，所以返回的是 `NgZone` （`NgZone`放到下一节讲）：

> angular/packages/core/src/application_ref.ts

```typescript
function getNgZone(ngZoneOption?: NgZone | 'zone.js' | 'noop'): NgZone {
  let ngZone: NgZone;

  if (ngZoneOption === 'noop') {
    ngZone = new NoopNgZone();
  } else {
    ngZone = (ngZoneOption === 'zone.js' ? undefined : ngZoneOption) ||
        new NgZone({enableLongStackTrace: isDevMode()});
  }
  return ngZone;
}
```

2. 接下来 angualr 创建了一个包含 ngZone 的 `providers`，作为根模块的父注入器

> angular/packages/core/src/application_ref.ts

```typescript
// 注释：会被 onInvoke 执行
const ngZoneInjector = Injector.create(
       {providers: providers, parent: this.injector, name: moduleFactory.moduleType.name});
   const moduleRef = <InternalNgModuleRef<M>>moduleFactory.create(ngZoneInjector);
```

3. 调用 `ngZone.run` ，启动 `ngZone` 并**让所有的 angular 程序跑在这个 `zone` 上下文环境里**
4. 在 `ngZone.run` 启动 zone 之后，创建一个初始的注入器，并使用该注入器作为根模块的父注入器创建根模块实例
5. 处理错误并返回


## 总结

这里面内容不多，用人话总结下：

1. `bootstrapModule` 会先合并配置并调用编译模块的工厂函数 `compileNgModuleFactory` 开始编译模块
2. `compileNgModuleFactory` 通过平台实例 `PlatformRef` 的注射器 `injector` 获取 JIT编译器工厂 `JitCompilerFactory`，JIT 编译器工厂 `JitCompilerFactory` 又通过 `createCompiler` 方法，创建编译器 `Compiler` 实例 `CompilerImpl`，并开始编译根模块和所有的组件，`CompilerImpl` 调用 `JitCompiler` JIT 编译实例 **最后实际上编译是`JitCompiler`去编译的**
3. **`JitCompiler` 加载模块 => 编译组件 => 编译模块**
4. **异步编译根模块和所有的组件**，**并放入缓存中**，最后返回 value 是模块工厂 `NgModuleFactory` 的 `Promise`
5. 然后在 `Promise.then()` 里调用 `bootstrapModuleFactory`
6. `bootstrapModuleFactory` **创建 NgZone 实例并开始运行 zone** ，**让所有的 angular 程序跑在这个 `zone` 上下文环境里**
7. 开始运行 zone ，**创建根模块的父注入器 `injector` 并实例化模块工厂创建模块实例 `NgModuleRef`**
