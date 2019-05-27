## 启动app

在浏览器端，每个 angular app都是从 `main.ts` 开始的。

```typescript
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
```

至于启动项目，都是这一行 `platformBrowserDynamic().bootstrapModule(AppModule)` 开始的。

在 angular 的世界中，所有的app都是由 `bootstrapModule` 根模块或主模块启动的。

Angular 应用是模块化的，它拥有自己的模块化系统，称作 `NgModule`。 

[关于 NgModule](https://www.angular.cn/guide/architecture-modules)

一个 `NgModule` 就是一个容器，用于存放一些内聚的代码块，这些代码块专注于某个应用领域、某个工作流或一组紧密相关的功能。

它可以包含一些组件、服务提供商或其它代码文件，其作用域由包含它们的 `NgModule` 定义。 它还可以导入一些由其它模块中导出的功能，并导出一些指定的功能供其它 `NgModule` 使用。

每个 Angular 应用都至少有一个 `NgModule` 类，也就是根模块，它习惯上命名为 `AppModule`，并位于一个名叫 `app.module.ts` 的文件中。

**引导这个根模块就可以启动你的应用**。

当 bootstrap（引导）根模块之后，`NgModule` 会继而实例化元数据中 `bootstrap`。

[bootstrap 应用的主视图，称为根组件。它是应用中所有其它视图的宿主。只有根模块才应该设置这个 `bootstrap` 属性](https://www.angular.cn/api/core/NgModule#bootstrap)


## platform

angular 抽象出 platform，来实现跨平台。

实例化 angular 根模块的 `bootstrapModule` 的方法在浏览器端来自 `@angular/platform-browser-dynamic`。

其实除了 `@angular/platform-browser-dynamic` 之外还有 `@angular/platform-browser`。

这两个模块的主要区别是编译方式的不同， `platform-browser-dynamic` 提供 JIT 编译,也就是说编译在浏览器内完成，而 `platform-browser` 提供 AOT 编译,编译在本地完成。

[至于区别](https://www.angular.cn/guide/aot-compiler#angular-compilation)


## platformBrowserDynamic

> angular/packages/platform-browser-dynamic/src/platform-browser-dynamic.ts

```typescript
/**
 * @publicApi
 */
export const platformBrowserDynamic = createPlatformFactory(
    platformCoreDynamic, 'browserDynamic', INTERNAL_BROWSER_DYNAMIC_PLATFORM_PROVIDERS);
```

`platformBrowserDynamic` 方法很简单，就是调用创建平台的工厂方法 `createPlatformFactory` 返回的一个**返回值是平台实例 `PlatformRef` 的函数**。


## createPlatformFactory

> angular/packages/core/src/application_ref.ts

```typescript
/**
 * Creates a factory for a platform
 *
 * @publicApi
 */
export function createPlatformFactory(
    parentPlatformFactory: ((extraProviders?: StaticProvider[]) => PlatformRef) | null,
    name: string, providers: StaticProvider[] = []): (extraProviders?: StaticProvider[]) =>
    PlatformRef {
  const desc = `Platform: ${name}`;
  const marker = new InjectionToken(desc);
  return (extraProviders: StaticProvider[] = []) => {
    let platform = getPlatform();
    if (!platform || platform.injector.get(ALLOW_MULTIPLE_PLATFORMS, false)) {
      if (parentPlatformFactory) {
        parentPlatformFactory(
            providers.concat(extraProviders).concat({provide: marker, useValue: true}));
      } else {
        const injectedProviders: StaticProvider[] =
            providers.concat(extraProviders).concat({provide: marker, useValue: true});
        createPlatform(Injector.create({providers: injectedProviders, name: desc}));
      }
    }
    return assertPlatform(marker);
  };
}
```

该方法接受三个参数：

  1. `parentPlatformFactory: ((extraProviders?: StaticProvider[]) => PlatformRef) | null` 返回父平台工厂实例的方法
  2. `name: string` 平台的名字
  3. `providers: StaticProvider[] = []` DI的服务提供者

1. 首先通过 `InjectionToken` 创建一个 `Platform: ${name}` 的[值提供商](https://www.angular.cn/guide/dependency-injection-providers#value-providers)
2. 然后返回一个方法，接受服务提供者 `extraProviders?: StaticProvider[]`，返回一个平台实例 `PlatformRef`

`createPlatformFactory` 返回的方法

1. 获取当前平台实例
2. 如果当前平台实例不存在并且不存在 `AllowMultipleToken` 这个允许多个令牌的服务提供者
   1. 父级平台工厂方法 `parentPlatformFactory` 存在，则**合并服务提供商**并递归调用 `parentPlatformFactory`
   2. 父级平台工厂方法 `parentPlatformFactory` 不存在，则**使用注入器创建实例方法 `Injector.create` 创建实例平台实例并用 `createPlatform` 设置为全局的平台实例**
3. 调用 `assertPlatform` 确认 IOC 容器中存在 该 `marker` 的平台实例并返回

**所以创建平台实例的顺序上，应该是 `合并 browserDynamic 的 provider => 合并 coreDynamic 的 provider => 合并 provider 并创建 core`**

大概用人话描述就是：

1. 判断是否已经创建过了
2. 判断是否有父 `Factory`
3. 如果有父 `Factory` 就把调用 `Factory` 时传入的 `Provider` 和调用 `createPlatformFactory` 传入的 `Provider` 合并，然后调用父 `Factory`
4. 如果没有父 `Factory` ，先创建一个 `Injector` ，然后去创建 `PlatformRef` 实例


## createPlatform

> angular/packages/core/src/application_ref.ts

```typescript

let _platform: PlatformRef;

/**
 * Creates a platform.
 * Platforms have to be eagerly created via this function.
 *
 * @publicApi
 */
export function createPlatform(injector: Injector): PlatformRef {
  if (_platform && !_platform.destroyed &&
      !_platform.injector.get(ALLOW_MULTIPLE_PLATFORMS, false)) {
    throw new Error(
        'There can be only one platform. Destroy the previous one to create a new one.');
  }
  _platform = injector.get(PlatformRef);
  const inits = injector.get(PLATFORM_INITIALIZER, null);
  if (inits) inits.forEach((init: any) => init());
  return _platform;
}
```

**`_platform` 是全局的唯一平台实例。**

创建平台实例关键方法，传入服务注入器实例 `injector` 返回平台实例：

1. 确认全局的平台实例存在，状态不是被销毁，并且不存在多个平台实例
2. 从注入器中获取平台实例
3. `injector.get(PLATFORM_INITIALIZER, null)` 获取**初始化平台时需要执行的函数并执行**

回过头看 `platformBrowserDynamic`：

> angular/packages/platform-browser-dynamic/src/platform-browser-dynamic.ts

```typescript
/**
 * @publicApi
 */
export const platformBrowserDynamic = createPlatformFactory(
    platformCoreDynamic, 'browserDynamic', INTERNAL_BROWSER_DYNAMIC_PLATFORM_PROVIDERS);
```

重点来了：`INTERNAL_BROWSER_DYNAMIC_PLATFORM_PROVIDERS`

这个 `providers` 究竟提供了什么服务？

> angular/packages/platform-browser-dynamic/src/platform_providers.ts

```typescript
/**
 * @publicApi
 */
export const INTERNAL_BROWSER_DYNAMIC_PLATFORM_PROVIDERS: StaticProvider[] = [
  INTERNAL_BROWSER_PLATFORM_PROVIDERS,
  {
    provide: COMPILER_OPTIONS,
    useValue: {providers: [{provide: ResourceLoader, useClass: ResourceLoaderImpl, deps: []}]},
    multi: true
  },
  {provide: PLATFORM_ID, useValue: PLATFORM_BROWSER_ID},
];
```

除了 `COMPILER_OPTIONS` 和 `PLATFORM_ID`，大概重点就是 `INTERNAL_BROWSER_PLATFORM_PROVIDERS` 了吧。

`INTERNAL_BROWSER_PLATFORM_PROVIDERS` 来自 `@angular/platform-browser`：

> angular/packages/platform-browser/src/browser.ts

```typescript
export const INTERNAL_BROWSER_PLATFORM_PROVIDERS: StaticProvider[] = [
  {provide: PLATFORM_ID, useValue: PLATFORM_BROWSER_ID},
  {provide: PLATFORM_INITIALIZER, useValue: initDomAdapter, multi: true},
  {provide: PlatformLocation, useClass: BrowserPlatformLocation, deps: [DOCUMENT]},
  {provide: DOCUMENT, useFactory: _document, deps: []},
];
```

`@angular/platform-browser` 提供了一些浏览器端的ng实现：

1. `PLATFORM_INITIALIZER` 是初始化需要执行的方法集合 **这个很重要**
2. `DOCUMENT` 浏览器端的 `document` ，`_document` 工厂方法返回 `document`

在上面，`createPlatform` 的时候，会 `const inits = injector.get(PLATFORM_INITIALIZER, null); if (inits) inits.forEach((init: any) => init());` 依次执行 `PLATFORM_INITIALIZER` 注入的工厂方法。

那么来看看 `initDomAdapter` 吧：

> angular/packages/platform-browser/src/browser.ts

```typescript
export function initDomAdapter() {
  BrowserDomAdapter.makeCurrent();
  BrowserGetTestability.init();
}
```

1. `BrowserDomAdapter.makeCurrent();` 通过 `BrowserDomAdapter` 的静态方法实例化一个 `BrowserDomAdapter` 全局DOM适配器 ，具体就是**实现并封装了一些在浏览器端的方法**，具体的可以看 `angular/packages/platform-browser/src/browser/browser_adapter.ts` 中的 `class BrowserDomAdapter extends GenericBrowserDomAdapter`
2. `BrowserGetTestability.init();` 则是初始化 angular 的测试，这个就没看了


回过头看下，在创建 `platformBrowserDynamic` 时候，传入了返回父平台实例的方法 `platformCoreDynamic`


## platformCoreDynamic

> angular/packages/platform-browser-dynamic/src/platform_core_dynamic.ts

```typescript
import {COMPILER_OPTIONS, CompilerFactory, PlatformRef, StaticProvider, createPlatformFactory, platformCore} from '@angular/core';
import {JitCompilerFactory} from './compiler_factory';

/**
 * A platform that included corePlatform and the compiler.
 *
 * @publicApi
 */
export const platformCoreDynamic = createPlatformFactory(platformCore, 'coreDynamic', [
  {provide: COMPILER_OPTIONS, useValue: {}, multi: true},
  {provide: CompilerFactory, useClass: JitCompilerFactory, deps: [COMPILER_OPTIONS]},
]);
```

`platformCoreDynamic` 又传入了

1. 来自 `@angular/core` 的 平台核心 `platformCore`
2. 平台名 `coreDynamic`
3. 2个静态服务提供者：编译选项 `COMPILER_OPTIONS` 和 `platformDynamic` 的[JIT](https://www.angular.cn/guide/aot-compiler#angular-compilation)编译器工厂 `JitCompilerFactory`


## platformCore

> angular/packages/core/src/platform_core_providers.ts

```typescript
import {PlatformRef, createPlatformFactory} from './application_ref';
import {PLATFORM_ID} from './application_tokens';
import {Console} from './console';
import {Injector, StaticProvider} from './di';
import {TestabilityRegistry} from './testability/testability';

const _CORE_PLATFORM_PROVIDERS: StaticProvider[] = [
  // Set a default platform name for platforms that don't set it explicitly.
  {provide: PLATFORM_ID, useValue: 'unknown'},
  // 在这里 PlatformRef 被加入了 injector 并在 createPlatformFactory 中实例化
  {provide: PlatformRef, deps: [Injector]},
  {provide: TestabilityRegistry, deps: []},
  {provide: Console, deps: []},
];

/**
 * This platform has to be included in any other platform
 *
 * @publicApi
 */
export const platformCore = createPlatformFactory(null, 'core', _CORE_PLATFORM_PROVIDERS);
```

`platformCore` 则是创建了一个返回根平台工厂实例的方法，并**设置了4个基础的DI的服务提供者**

1. `PLATFORM_ID` 平台id
2. `PlatformRef` 在这里 `PlatformRef` 被加入了 `injector` 并在**后续的 `createPlatformFactory` 中通过 `createPlatform(Injector.create({providers: injectedProviders, name: desc}));` 平台实例会被实例化**
3. `TestabilityRegistry` 可测试性注册表 **测试相关**
4. `Console` **很有意思 angular 把 Console 作为服务注入了DI，但是 Console 只实现了 log和warn两个方法**


## PlatformRef

> angular/packages/core/src/application_ref.ts

```typescript
@Injectable()
export class PlatformRef {
  private _modules: NgModuleRef<any>[] = [];
  private _destroyListeners: Function[] = [];
  private _destroyed: boolean = false;

  /** @internal */
  constructor(private _injector: Injector) {}

  bootstrapModuleFactory<M>(moduleFactory: NgModuleFactory<M>, options?: BootstrapOptions):
      Promise<NgModuleRef<M>> {
        ...
  }

  bootstrapModule<M>(
      moduleType: Type<M>, compilerOptions: (CompilerOptions&BootstrapOptions)|
      Array<CompilerOptions&BootstrapOptions> = []): Promise<NgModuleRef<M>> {
    const options = optionsReducer({}, compilerOptions);
    return compileNgModuleFactory(this.injector, options, moduleType)
        .then(moduleFactory => this.bootstrapModuleFactory(moduleFactory, options));
  }

  private _moduleDoBootstrap(moduleRef: InternalNgModuleRef<any>): void {
    ...
  }

  onDestroy(callback: () => void): void { this._destroyListeners.push(callback); }

  get injector(): Injector { return this._injector; }

  destroy() {
    if (this._destroyed) {
      throw new Error('The platform has already been destroyed!');
    }
    this._modules.slice().forEach(module => module.destroy());
    this._destroyListeners.forEach(listener => listener());
    this._destroyed = true;
  }

  get destroyed() { return this._destroyed; }
}
```

`PlatformRef` 就是平台实例的类，有一些方法和属性等，例如几个关键的方法

1. `bootstrapModule` 引导根模块的方法
2. `bootstrapModuleFactory` 实例模块的工厂方法，会**运行 zone.js 并监听事件**
3. `destroy` 销毁平台实例的方法

这个我们放到后文去说吧


## 总结

调用 `platformBrowserDynamic()` 并生成平台实例 `PlatformRef` 时大概经历了这些：

1. 调用 `createPlatformFactory` 合并平台 `browserDynamic` 的 `providers` 并触发父级平台 `coreDynamic` 的平台工厂函数
2. 调用 `createPlatformFactory` 合并平台 `coreDynamic` 的 `providers` 并触发父级平台 `core` 的平台工厂函数
3. 由于平台 `core` 无父级平台，**调用 `Injector.create` 创建 `PlatformRef` 实例**，并**赋值给全局唯一的平台实例 `_platform`**
4. 在 `createPlatform` 创建 `PlatformRef` 的时候，实例化一个 `BrowserDomAdapter` 全局DOM适配器 ，具体就是**实现并封装了一些在浏览器端的方法**
5. 最后断言，确认存在 `PlatformRef` 实例，并返回 `PlatformRef` 实例