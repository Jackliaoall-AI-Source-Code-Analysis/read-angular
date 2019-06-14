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
   2. 懒加载的模块**有自己的注入器，通常是 app roo t注入器的子注入器**，在**懒加载模块内为单例服务**
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

/**
 * @suppress {globalThis}
 */
export function makeDecorator<T>(
    name: string, props?: (...args: any[]) => any, parentClass?: any,
    additionalProcessing?: (type: Type<T>) => void,
    typeFn?: (type: Type<T>, ...args: any[]) => void):
    {new (...args: any[]): any; (...args: any[]): any; (...args: any[]): (cls: any) => any;} {
  const metaCtor = makeMetadataCtor(props);

  function DecoratorFactory(...args: any[]): (cls: Type<T>) => any {
    if (this instanceof DecoratorFactory) {
      metaCtor.call(this, ...args);
      return this;
    }

    const annotationInstance = new (DecoratorFactory as any)(...args);
    return function TypeDecorator(cls: Type<T>) {
      if (typeFn) typeFn(cls, ...args);
      // Use of Object.defineProperty is important since it creates non-enumerable property which
      // prevents the property is copied during subclassing.
      const annotations = cls.hasOwnProperty(ANNOTATIONS) ?
          (cls as any)[ANNOTATIONS] :
          Object.defineProperty(cls, ANNOTATIONS, {value: []})[ANNOTATIONS];
      annotations.push(annotationInstance);


      if (additionalProcessing) additionalProcessing(cls);

      return cls;
    };
  }

  if (parentClass) {
    DecoratorFactory.prototype = Object.create(parentClass.prototype);
  }

  DecoratorFactory.prototype.ngMetadataName = name;
  (DecoratorFactory as any).annotationCls = DecoratorFactory;
  return DecoratorFactory as any;
}
```

参数：
1. `name: string` 就是装饰器的名称
2. `props?: (...args: any[]) => any` `args` 就是装饰器的参数，`props` 用来处理装饰器参数，**可用于默认值设置**
3. `parentClass?: any` 父类，提供给 `DecoratorFactory` 实例用来继承
4. `additionalProcessing?: (type: Type<T>) => void` 对类构造函数进行额外处理，**参数是装饰器的宿主类的构造函数**
5. `typeFn?: (type: Type<T>, ...args: any[]) => void)` 在装饰器的返回函数中，会再次执行下回调函数，参数是**类构造函数和参数**

在这里 `makeDecorator` 基本上做了这几个事情：

1. 通过 `makeMetadataCtor` 创建一个**给类构造函数附加初始值的函数**
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

![AppModule.__annotations__](https://raw.githubusercontent.com/DimaLiLongJi/read-angular/master/docs/img/annotations.png)


## 编译模块

**此处建议结合[第二章bootstrapModule](/#/bootstrapModule)一起阅读**

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
  private _delegate: JitCompiler;
  constructor(
      injector: Injector, private _metadataResolver: CompileMetadataResolver,
      templateParser: TemplateParser, styleCompiler: StyleCompiler, viewCompiler: ViewCompiler,
      ngModuleCompiler: NgModuleCompiler, summaryResolver: SummaryResolver<Type<any>>,
      compileReflector: CompileReflector, jitEvaluator: JitEvaluator,
      compilerConfig: CompilerConfig, console: Console) {
    this._delegate = new JitCompiler( // 注释：JIT 编译器
        _metadataResolver, templateParser, styleCompiler, viewCompiler, ngModuleCompiler,
        summaryResolver, compileReflector, jitEvaluator, compilerConfig, console,
        this.getExtraNgModuleProviders.bind(this));
  }
  compileModuleAsync<T>(moduleType: Type<T>): Promise<NgModuleFactory<T>> { // 注释：异步创建模块及其子组件
    return this._delegate.compileModuleAsync(moduleType) as Promise<NgModuleFactory<T>>;
  }
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
      private getExtraNgModuleProviders: (ngModule: any) => CompileProviderMetadata[]) {}

  compileModuleAsync(moduleType: Type): Promise<object> {
    return Promise.resolve(this._compileModuleAndComponents(moduleType, false)); // 注释：其实 JTI 编译在这步做的
  }

  private _compileModuleAndComponents(moduleType: Type, isSync: boolean): SyncAsync<object> {
    return SyncAsync.then(this._loadModules(moduleType, isSync), () => {
      this._compileComponents(moduleType, null);
      return this._compileModule(moduleType);
    });
  }
}
```

结合第二章引导模块总结下：

`compileModuleAsync` 在这里只做了三件事：

1. 加载模块 `this._loadModules`
2. 编译组件 `this._compileComponents`
3. 编译模块 `this._compileModule`

### _loadModules

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
  ...
  private _loadModules(mainModule: any, isSync: boolean): SyncAsync<any> { // 注释：isSync:false 异步加载解析主模块，也就是 bootstrap 的 ngModule
    const loading: Promise<any>[] = [];
    // 注释：从元数据中获得根模块的 __annotations__ 并格式化
    const mainNgModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    // 注释：异步编译全部指令组件和和管道的元数据
    // 注释：过滤掉根模块元数据中的 AOT 模块
    this._filterJitIdentifiers(mainNgModule.transitiveModule.modules).forEach((nestedNgModule) => {
      // getNgModuleMetadata only returns null if the value passed in is not an NgModule
      const moduleMeta = this._metadataResolver.getNgModuleMetadata(nestedNgModule) !;
      this._filterJitIdentifiers(moduleMeta.declaredDirectives).forEach((ref) => {
        // 注释：异步编译全部指令组件和和管道
        const promise =
            this._metadataResolver.loadDirectiveMetadata(moduleMeta.type.reference, ref, isSync);
        if (promise) {
          loading.push(promise);
        }
      });
      this._filterJitIdentifiers(moduleMeta.declaredPipes)
          .forEach((ref) => this._metadataResolver.getOrLoadPipeMetadata(ref));
    });
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
2. 调用 `this._filterJitIdentifiers` **递归过滤掉根模块元数据中的 AOT 模块**
3. 调用 `this._metadataResolver.loadDirectiveMetadata(moduleMeta.type.reference, ref, isSync)` **异步编译全部指令组件和和管道的元数据**
4. 最后返回异步编译的结果

接下来继续看 `_compileModuleAndComponents` 在加载完模块之后，调用了 `this._compileComponents` 编译组件：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
  private _compileModuleAndComponents(moduleType: Type, isSync: boolean): SyncAsync<object> {
    return SyncAsync.then(this._loadModules(moduleType, isSync), () => {
      this._compileComponents(moduleType, null);
      return this._compileModule(moduleType);
    });
  }
}
```

### _compileComponents

`_compileComponents` 方法用来编译 `entryComponents` （此处只假设是 `bootstrap` 的根组件）：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
export class JitCompiler {
  _compileComponents(mainModule: Type, allComponentFactories: object[]|null) {
    const ngModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    const moduleByJitDirective = new Map<any, CompileNgModuleMetadata>();
    const templates = new Set<CompiledTemplate>();

    const transJitModules = this._filterJitIdentifiers(ngModule.transitiveModule.modules);
    transJitModules.forEach((localMod) => {
      const localModuleMeta = this._metadataResolver.getNgModuleMetadata(localMod) !;
      this._filterJitIdentifiers(localModuleMeta.declaredDirectives).forEach((dirRef) => {
        moduleByJitDirective.set(dirRef, localModuleMeta);
        const dirMeta = this._metadataResolver.getDirectiveMetadata(dirRef);
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
    templates.forEach((template) => this._compileTemplate(template));
  }
}
```




## _metadataResolver

几乎所有的编译组件和



## 总结


1. 
