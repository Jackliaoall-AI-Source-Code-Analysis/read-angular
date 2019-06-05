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

每一个异步方法的执行都在 zone 都被当做为一个Task，并在Task的基础上，zone 为开发者提供了执行前后的钩子函数，来获得执行前后的信息。

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

3. 调用 `forkInnerZoneWithAngularBehavior` 从当前的 zone（**其实此时就是根`<root>Zone`**） fork 出一份 angular zone，并设置监听方法

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

大概讲下 `Zone` 

`Zone` 是个自执行函数，

**执行的时候会创建一个 `parent` 和 `zoneSpec` 都是 `null`，并且 `name` 是 `<root>` 的 `Zone` 实例，所以 `Zone` 是一颗有唯一根节点的树**

执行的末尾通过把 `class Zone` 赋值给顶层变量的 `Zone` 属性。

> zone.js/lib/zone.ts

```typescript
const Zone: ZoneType = (function(global: any) {
  ...
  class Zone implements AmbientZone {
    ...
  }
  ...
  let _currentZoneFrame: _ZoneFrame = {parent: null, zone: new Zone(null, null)};
  ...
  return global['Zone'] = Zone;
})(global);
```

在上面，`forkInnerZoneWithAngularBehavior` 中执行了 `zone._inner.fork` 

`zone.fork` 主要是创建一个子 `Zone` 实例，而 `fork` 方法主要调用构造函数中实例化的 `ZoneDelegate` 实例的 `fork` 方法：

> zone.js/lib/zone.ts

```typescript
class Zone implements AmbientZone {
  constructor(parent: Zone|null, zoneSpec: ZoneSpec|null) {
      this._parent = parent;
      this._name = zoneSpec ? zoneSpec.name || 'unnamed' : '<root>';
      this._properties = zoneSpec && zoneSpec.properties || {};
      this._zoneDelegate =
          new ZoneDelegate(this, this._parent && this._parent._zoneDelegate, zoneSpec);
  }

  public fork(zoneSpec: ZoneSpec): AmbientZone {
    if (!zoneSpec) throw new Error('ZoneSpec required!');
    return this._zoneDelegate.fork(this, zoneSpec);
  }
}
```

每个 `Zone` 都会有一个 `ZoneDelegate` 代理实例，主要**为 `Zone` 调用传入的回调函数，建立、调用回调函数中的异步任务，捕捉异步任务的错误**

这里通过调用 `ZoneDelegate` 实例的 `fork` 方法**从根 `Zone` 创建了一个 `Zone`**：

> zone.js/lib/zone.ts

```typescript
class ZoneDelegate implements AmbientZoneDelegate {
  fork(targetZone: Zone, zoneSpec: ZoneSpec): AmbientZone {
      return this._forkZS ? this._forkZS.onFork!(this._forkDlgt!, this.zone, targetZone, zoneSpec) :
                            new Zone(targetZone, zoneSpec);
  }
}
```

## ZoneDelegate

了解下 zone 的代理 `ZoneDelegate`

当 `Zone` 初始化自己的代理 `ZoneDelegate` 时，会把 `Zone` 实例 和父级的 `zoneSpec` 传入：

> zone.js/lib/zone.ts

```typescript
class Zone implements AmbientZone {
  constructor(parent: Zone|null, zoneSpec: ZoneSpec|null) {
      this._parent = parent;
      this._name = zoneSpec ? zoneSpec.name || 'unnamed' : '<root>';
      this._properties = zoneSpec && zoneSpec.properties || {};
      this._zoneDelegate =
          new ZoneDelegate(this, this._parent && this._parent._zoneDelegate, zoneSpec);
  }
}

class ZoneDelegate implements AmbientZoneDelegate {
  constructor(zone: Zone, parentDelegate: ZoneDelegate|null, zoneSpec: ZoneSpec|null) {}
}
```

## Zone.__load_patch

`Zone` 中最重要的一部分就在这里，**zone 通过 monkey patch 的方式，暴力将浏览器内的异步API进行封装并替换掉**

这样**当在 Zone 的上下文内运行时，并可以通过 `Zone.current` 来通知 angular 进行到了哪里并进行变更检测**

这部分在打包 zonejs 的时候就将这几个替换API操作的文件根据平台打包到一起了，举个浏览器的例子：

> zone.js/lib/browser/browser.ts

```typescript
Zone.__load_patch('timers', (global: any) => {
  const set = 'set';
  const clear = 'clear';
  patchTimer(global, set, clear, 'Timeout');
  patchTimer(global, set, clear, 'Interval');
  patchTimer(global, set, clear, 'Immediate');
});
```

具体加载补丁的方法

> zone.js/lib/zone.ts

```typescript
class Zone implements AmbientZone {
  static __load_patch(name: string, fn: _PatchFn): void {
      if (patches.hasOwnProperty(name)) {
        if (checkDuplicate) {
          throw Error('Already loaded patch: ' + name);
        }
      } else if (!global['__Zone_disable_' + name]) {
        const perfName = 'Zone:' + name;
        mark(perfName);
        patches[name] = fn(global, Zone, _api);
        performanceMeasure(perfName, perfName);
      }
    }
}

```



## ngZone.run

当初始化好 `Zone` 和 `ZoneDelegate` ，angular 调用了 `ngZone.run`

> angular/packages/core/src/zone/ng_zone.ts

```typescript
public run<T>(callback: (...args: any[]) => T, applyThis?: any, applyArgs?: any[], source?: string): T {
  _currentZoneFrame = {parent: _currentZoneFrame, zone: this};
  try {
    return this._zoneDelegate.invoke(this, callback, applyThis, applyArgs, source);
  } finally {
    _currentZoneFrame = _currentZoneFrame.parent!;
  }
}
```







## 总结

用人话总结下：

