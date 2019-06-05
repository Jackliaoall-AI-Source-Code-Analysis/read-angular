## zone

angularjs 时代的脏检查，通过触发 `$scope.$apply` `$scope.$digest` 来通知进行脏检查并更新视图。

从 angularjs 的行为中，谷歌大佬们发现，所有的视图变更都来自于下面集中行为：

1. 浏览器事件：`onclick`, `onmouseover`, `onkeyup`
2. 定时器：`setInterval`, `setTimeout`, `setImmediate`
3. 异步api：`ajax`，`fetch`，`Promise.then`
4. 生命周期

angular 便把在 Dart 中实践过的 zone 的技术在 JavaScript 中实现了一次。


## 什么是zone

Dart 中的异步操作是无法被当前代码 `try/cacth` 的，而在 Dart 中你可以给执行对象指定一个 zone，类似提供一个**沙箱环境** 。

而在这个沙箱内，你就可以全部可以捕获、拦截或修改一些代码行为，比如所有未被处理的异常。

用人话说，**zone 就是一个类似 JavaScript 中的执行上下文**，提供了一个环境或者过程。

在当前 zone 中执行了某些函数，**zone 可以通过一些事件通知外部**，函数或方法执行到了哪里，发生了什么。


## 实例化ngZone

angular 启动 zonejs 是在上文说过的 `bootstrapModule` 阶段：

> angular/packages/core/src/application_ref.ts

```typescript
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
```

在实例化模块工厂之前，通过 `getNgZone` 获取了一个 `NgZone` 实例：

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


## ngZone

> angular/packages/core/src/zone/ng_zone.ts

```typescript
export class NgZone {
  ...

  constructor({enableLongStackTrace = false}) {
    if (typeof Zone == 'undefined') {
      throw new Error(`In this configuration Angular requires Zone.js`);
    }

    Zone.assertZonePatched();
    const self = this as any as NgZonePrivate;
    self._nesting = 0;

    self._outer = self._inner = Zone.current;

    if ((Zone as any)['wtfZoneSpec']) {
      self._inner = self._inner.fork((Zone as any)['wtfZoneSpec']);
    }

    if ((Zone as any)['TaskTrackingZoneSpec']) {
      self._inner = self._inner.fork(new ((Zone as any)['TaskTrackingZoneSpec'] as any));
    }

    if (enableLongStackTrace && (Zone as any)['longStackTraceZoneSpec']) {
      self._inner = self._inner.fork((Zone as any)['longStackTraceZoneSpec']);
    }

    forkInnerZoneWithAngularBehavior(self);
  }

  ...

  run<T>(fn: (...args: any[]) => T, applyThis?: any, applyArgs?: any[]): T {
    return (this as any as NgZonePrivate)._inner.run(fn, applyThis, applyArgs) as T;
  }

}
```

1. 在实例化 ngZone 的时候，首先调用了 zone 的一个静态方法 `assertZonePatched`，确认下 zone 是否已经打过补丁（是否替换过原生 API 至于为什么我们往下面再说）

> zone.js/lib/zone.ts

```typescript
class Zone implements AmbientZone {
 static __symbol__: (name: string) => string = __symbol__;

 static assertZonePatched() {
   if (global['Promise'] !== patches['ZoneAwarePromise']) {
     throw new Error(
         'Zone.js has detected that ZoneAwarePromise `(window|global).Promise` ' +
         'has been overwritten.\n' +
         'Most likely cause is that a Promise polyfill has been loaded ' +
         'after Zone.js (Polyfilling Promise api is not necessary when zone.js is loaded. ' +
         'If you must load one, do so before loading zone.js.)');
   }
 }
}
```

2. 初始化 zone 的 `_outer` 和 `_inner` 为当前全局的 zone `Zone.current`

> zone.js/lib/zone.ts

```typescript
interface ZoneType {
  /**
   * @returns {Zone} Returns the current [Zone]. The only way to change
   * the current zone is by invoking a run() method, which will update the current zone for the
   * duration of the run method callback.
   */
  current: Zone;
}
```

`Zone.current` 是 zone 上的一个静态属性，用来保存全局此刻正在使用的 zone，**只能通过 `zone.run` 来 更改**

3. 调用 `forkInnerZoneWithAngularBehavior` 从当前的 zone fork 出一份 angular zone，并设置监听方法

> angular/packages/core/src/zone/ng_zone.ts

```typescript
function forkInnerZoneWithAngularBehavior(zone: NgZonePrivate) {
  zone._inner = zone._inner.fork({
    name: 'angular',
    properties: <any>{'isAngularZone': true},
    onInvokeTask: (delegate: ZoneDelegate, current: Zone, target: Zone, task: Task, applyThis: any,
                   applyArgs: any): any => {
      try {
        onEnter(zone);
        return delegate.invokeTask(target, task, applyThis, applyArgs);
      } finally {
        onLeave(zone);
      }
    },


    onInvoke: (delegate: ZoneDelegate, current: Zone, target: Zone, callback: Function,
               applyThis: any, applyArgs: any[], source: string): any => {
      try {
        onEnter(zone);
        return delegate.invoke(target, callback, applyThis, applyArgs, source);
      } finally {
        onLeave(zone);
      }
    },

    onHasTask:
        (delegate: ZoneDelegate, current: Zone, target: Zone, hasTaskState: HasTaskState) => {
          delegate.hasTask(target, hasTaskState);
          if (current === target) {
            // We are only interested in hasTask events which originate from our zone
            // (A child hasTask event is not interesting to us)
            if (hasTaskState.change == 'microTask') {
              zone.hasPendingMicrotasks = hasTaskState.microTask;
              checkStable(zone);
            } else if (hasTaskState.change == 'macroTask') {
              zone.hasPendingMacrotasks = hasTaskState.macroTask;
            }
          }
        },

    onHandleError: (delegate: ZoneDelegate, current: Zone, target: Zone, error: any): boolean => {
      delegate.handleError(target, error);
      zone.runOutsideAngular(() => zone.onError.emit(error));
      return false;
    }
  });
}
```

## Zone

详细讲下 `Zone` ：




## 总结

用人话总结下：

