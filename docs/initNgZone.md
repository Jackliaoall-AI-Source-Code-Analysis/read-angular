## angular触发脏检查

[直接看人话总结](#总结)

angularjs 时代，通过触发 `$scope.$apply` `$scope.$digest` 来通知进行脏检查并更新视图。

从 angularjs 的行为中，谷歌大佬们发现，所有的视图变更都来自于下面集中行为：

1. 浏览器事件：`onclick`, `onmouseover`, `onkeyup`
2. 定时器：`setInterval`, `setTimeout`, `setImmediate`
3. 异步api：`ajax`，`fetch`，`Promise.then`
4. 生命周期

angular 便把在 Dart 中实践过的 zone 的技术在 JavaScript 中实现了一次。


## 什么是zone

Dart 中的异步操作是无法被当前代码 `try/cacth` 的，而在 Dart 中你可以给执行对象指定一个 zone，类似提供一个**上下文执行环境** 。

而在这个执行环境内，你就可以全部可以捕获、拦截或修改一些代码行为，比如所有未被处理的异常。

用人话说，**zone 就是一个类似 JavaScript 中的执行上下文**，提供了一个环境或者过程。

每一个异步方法的执行都在 zone 都被当做为一个Task，并在Task的基础上，zone 为开发者提供了执行前后的钩子函数，来获得执行前后的信息。

### Zone

大概讲下 `Zone` ：

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

`Zone` 是个自执行函数

**执行的时候会创建一个 `parent` 和 `zoneSpec` 都是 `null`，并且 `name` 是 `<root>` 的 `Zone` 实例，所以 `Zone` 是一颗有唯一根节点的树**


执行的末尾通过把 `class Zone` 赋值给顶层变量的 `Zone` 属性。

### ZoneDelegate

了解下 zone 的代理 `ZoneDelegate`

**`zoneSpec` 是 `fork` 子 zone 的时候传入的配置对象**

当 `Zone` 初始化自己的代理 `ZoneDelegate` 时，会把 `Zone` 实例 和父级的 `zoneSpec` 传入

在 `Zone` 初始化时，会同步初始化一个代理 `ZoneDelegate` ：

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
```

`ZoneDelegate` 的构造函数把通过 `fork` 方法创建 `Zone` 时传入的配置和钩子函数初始化到 `ZoneDelegate` 代理实例上：

> zone.js/lib/zone.ts

```typescript
class ZoneDelegate implements AmbientZoneDelegate {
  ...
  constructor(zone: Zone, parentDelegate: ZoneDelegate|null, zoneSpec: ZoneSpec|null) {
    ...
     this._forkZS = zoneSpec && (zoneSpec && zoneSpec.onFork ? zoneSpec : parentDelegate!._forkZS);
      this._forkDlgt = zoneSpec && (zoneSpec.onFork ? parentDelegate : parentDelegate!._forkDlgt);
      this._forkCurrZone = zoneSpec && (zoneSpec.onFork ? this.zone : parentDelegate!.zone);
    ...
  }

  fork(targetZone: Zone, zoneSpec: ZoneSpec): AmbientZone {
      return this._forkZS ? this._forkZS.onFork!(this._forkDlgt!, this.zone, targetZone, zoneSpec) :
                            new Zone(targetZone, zoneSpec);
  }
  ...
}
```

最后，**实际上代理执行钩子的时候，比如 `zone.fork` 的时候的配置对象内有钩子函数，那么就会调用钩子函数来执行**

每个 `Zone` 都会有一个 `ZoneDelegate` 代理实例，主要**为 `Zone` 调用传入的回调函数，建立、调用回调函数中的异步任务，捕捉异步任务的错误**

### Zone.__load_patch

**zone 通过 monkey patch 的方式，暴力将浏览器内的异步API进行封装并替换掉**，这一块就在这里。

这样**当在 Zone 的上下文内运行时，并可以通过 `Zone.current` 来通知 angular 进行到了哪里并进行变更检测（其实也就是所谓的触发脏检查）**（至于如果触发的我们放到下章再讲）

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

具体加载定时器补丁的方法：

> zone.js/lib/common/timers.ts

```typescript
export function patchTimer(window: any, setName: string, cancelName: string, nameSuffix: string) {
  let setNative: Function|null = null;
  let clearNative: Function|null = null;
  ...
  setNative =
      patchMethod(window, setName, (delegate: Function) => function(self: any, args: any[]) {
        ...
      });
    ...
}
```


通过 `patchMethod` 将原生API替换为被 zone 封装过的API来获得与 `Zone` 通信并触发钩子函数的能力：

> zone.js/lib/common/utils.ts

```typescript
export function patchMethod(
    target: any, name: string,
    patchFn: (delegate: Function, delegateName: string, name: string) => (self: any, args: any[]) =>
        any): Function|null {
  let proto = target;
  while (proto && !proto.hasOwnProperty(name)) {
    proto = ObjectGetPrototypeOf(proto);
  }
  if (!proto && target[name]) {
    // somehow we did not find it, but we can see it. This happens on IE for Window properties.
    proto = target;
  }

  const delegateName = zoneSymbol(name);
  let delegate: Function|null = null;
  if (proto && !(delegate = proto[delegateName])) {
    delegate = proto[delegateName] = proto[name];
    // check whether proto[name] is writable
    // some property is readonly in safari, such as HtmlCanvasElement.prototype.toBlob
    const desc = proto && ObjectGetOwnPropertyDescriptor(proto, name);
    if (isPropertyWritable(desc)) {
      const patchDelegate = patchFn(delegate!, delegateName, name);
      proto[name] = function() {
        return patchDelegate(this, arguments as any);
      };
      attachOriginToPatched(proto[name], delegate);
      if (shouldCopySymbolProperties) {
        copySymbolProperties(delegate, proto[name]);
      }
    }
  }
  return delegate;
}
```

最后用一个全局变量 `patches: {[key: string]: any}` 存储打过的补丁，可以用来判断 zone 是否已经上过补丁等。

> zone.js/lib/zone.ts

```typescript
const patches: {[key: string]: any} = {};

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

### Task

在 zone 中，每种异步都被称为任务 ：`Task`

```typescript
type TaskType = 'microTask'|'macroTask'|'eventTask';
type TaskState = 'notScheduled'|'scheduling'|'scheduled'|'running'|'canceling'|'unknown';
interface Task {
  type: TaskType;
  state: TaskState;
  source: string;
  invoke: Function;
  callback: Function;
  data?: TaskData;
  scheduleFn?: (task: Task) => void;
  cancelFn?: (task: Task) => void;
  readonly zone: Zone;
  runCount: number;
  cancelScheduleRequest(): void;
}
```

`Task` 分为三种：

1. MicroTask：在当前task结束之后和下一个task开始之前执行的，不可取消，如 `Promise，MutationObserver、process.nextTick`
2. MacroTask：一段时间后才执行的task，可以取消，如 `setTimeout, setInterval, setImmediate, I/O, UI rendering`
3. EventTask：监听事件，可能执行0次或多次，执行时间是不确定的

只有这三种，所以**像 DOM0 级别事件如 `img.onload=()=>{}`，在 angular里面是无法触发脏检查的。**

`Task` 的状态则有 `'notScheduled'|'scheduling'|'scheduled'|'running'|'canceling'|'unknown';` 

而设置执行运行时的钩子则需要在 `zone.fork` 时设置配置，看这里：

> zone.js/lib/zone.ts

```typescript
interface ZoneSpec {
  ...
  /**
   * Allows interception of task scheduling.
   */
  onScheduleTask?:
      (parentZoneDelegate: ZoneDelegate, currentZone: Zone, targetZone: Zone, task: Task) => Task;

  onInvokeTask?:
      (parentZoneDelegate: ZoneDelegate, currentZone: Zone, targetZone: Zone, task: Task,
       applyThis: any, applyArgs?: any[]) => any;

  /**
   * Allows interception of task cancellation.
   */
  onCancelTask?:
      (parentZoneDelegate: ZoneDelegate, currentZone: Zone, targetZone: Zone, task: Task) => any;

  /**
   * Notifies of changes to the task queue empty status.
   */
  onHasTask?:
      (parentZoneDelegate: ZoneDelegate, currentZone: Zone, targetZone: Zone,
       hasTaskState: HasTaskState) => void;
}
```

1. `onScheduleTask` 创建异步任务
2. `onInvokeTask` 执行异步任务
3. `onCancelTask` 取消异步任务
4. `onHasTask` 通知任务队列空状态的更改

通过设置这几种钩子，angular 就能知道某些异步任务执行的哪一步，也可以通过钩子去触发脏检查


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
   ...
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

### ngZone

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

2. 初始化 zone

`_nesting` 为 `Zone` 执行栈的层数（这个放后面说）

> angular/packages/core/src/zone/ng_zone.ts

```typescript
class NgZone {
    constructor({enableLongStackTrace = false}) {
    if (typeof Zone == 'undefined') {
      throw new Error(`In this configuration Angular requires Zone.js`);
    }

    Zone.assertZonePatched(); // 注释：确认是否已经上过zone补丁
    const self = this as any as NgZonePrivate;
    self._nesting = 0;

    self._outer = self._inner = Zone.current; // 注释：此时是 root zone

    ...
  }
}
```

`_outer` 和 `_inner` 为当前全局的 zone `Zone.current`，

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

3. 调用 `forkInnerZoneWithAngularBehavior` 从当前的 zone（**其实此时就是根`<root>Zone`**） fork 出一份 angular zone，并设置钩子

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

### zone.fork

在上面，`getNgZone` 的时候会 `new NgZone`,

而在 `NgZone` 构造函数的结尾，`forkInnerZoneWithAngularBehavior` 中执行了 `zone._inner.fork` ： 

> angular/packages/core/src/zone/ng_zone.ts

```typescript
export class NgZone {
  constructor({enableLongStackTrace = false}) {
    ...
    forkInnerZoneWithAngularBehavior(self);
  }
}
function forkInnerZoneWithAngularBehavior(zone: NgZonePrivate) {
  zone._inner = zone._inner.fork({
    name: 'angular',
    ...
  });
}
```

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

所以，当初始化 `ngZone` 的时候，这个 `zone._inner` 就是 `Zone.current`，也就是 `let _currentZoneFrame: _ZoneFrame = {parent: null, zone: new Zone(null, null)};` 时候创建的 `new Zone(null, null)` root zone。

因此此时的 `zone._inner` 就是 `Zone.current` 其实也是 `<root> Zone`

**所以`angular zone` 是从 `<root>Zone` fork 出的子 zone**。

### ngZone.run

当初始化好 `Zone` 和 `ZoneDelegate` ，angular 调用了 `ngZone.run`

> angular/packages/core/src/zone/ng_zone.ts

```typescript
export class NgZone {
  run<T>(fn: (...args: any[]) => T, applyThis?: any, applyArgs?: any[]): T {
    return (this as any as NgZonePrivate)._inner.run(fn, applyThis, applyArgs) as T;
  }
}
```

`ngZone.run` 又调用了 `zone.run`

> zone.js/lib/zone.ts

```typescript
interface _ZoneFrame {
  parent: _ZoneFrame|null;
  zone: Zone;
}

let _currentZoneFrame: _ZoneFrame = {parent: null, zone: new Zone(null, null)};

class Zone implements AmbientZone {
   public run<T>(callback: (...args: any[]) => T, applyThis?: any, applyArgs?: any[], source?: string): T {
     _currentZoneFrame = {parent: _currentZoneFrame, zone: this};
     try {
       return this._zoneDelegate.invoke(this, callback, applyThis, applyArgs, source);
     } finally {
       _currentZoneFrame = _currentZoneFrame.parent!;
     }
   }
}
```

`_currentZoneFrame` 是一个全局对象，保存了当前系统中的 zone 帧链

在初始化的时候，会创建一个 `parent: null, zone: new Zone` 的根 `_currentZoneFrame`，因此**根 `Zone` 就是在这里被创建的**

它有两个属性：

1. `parent` 指向了父 `zoneFrame`
2. `zone` 指向了当前激活的zone对象

所以 `_currentZoneFrame` 并不是固定不变的。

`ngZone.run` 又触发了 `this._zoneDelegate.invoke`

### zoneDelegate.invoke

zone 是通过 `this._zoneDelegate.invoke` 执行一个函数：

> angular/packages/core/src/zone/ng_zone.ts

```typescript
class ZoneDelegate implements AmbientZoneDelegate {
  private _invokeZS: ZoneSpec|null;

  constructor(zone: Zone, parentDelegate: ZoneDelegate|null, zoneSpec: ZoneSpec|null) {
    this._invokeZS = zoneSpec && (zoneSpec.onInvoke ? zoneSpec : parentDelegate!._invokeZS);
  }

  invoke(
    targetZone: Zone, callback: Function, applyThis: any, applyArgs?: any[], source?: string): any {
    return this._invokeZS ? this._invokeZS.onInvoke!
                           (this._invokeDlgt!, this._invokeCurrZone!, targetZone, callback,
                            applyThis, applyArgs, source) :
                           callback.apply(applyThis, applyArgs);
  }
}
```

`invoke` 方法接受4个参数：

1. `targetZone: Zone` 当前调用 `ZoneDelegate` 的 `Zone` 实例
2. `callback: Function` **回调函数，其实就是 `zone.run(callback)` 传入的那个函数，实例化模块组件的函数**
3. `applyThis: any` 需要绑定的 `this`
4. `applyArgs?: any[]` 回调函数的参数
5. `source?: string` 资源暂时不知道干嘛的


`invoke` 方法的作用就是：如果 **`this._invokeZS` 存在并且有 `onInvoke` 钩子就用 `this._invokeZS.onInvoke` 执行回调，否则仅仅调用回调函数**。

所以回到一开始实例化 `ngZone` 的最后 `forkInnerZoneWithAngularBehavior` 的代码：

> angular/packages/core/src/zone/ng_zone.ts

```typescript
function forkInnerZoneWithAngularBehavior(zone: NgZonePrivate) {
  zone._inner = zone._inner.fork({
    name: 'angular',
    ....
    onInvoke: (delegate: ZoneDelegate, current: Zone, target: Zone, callback: Function,
               applyThis: any, applyArgs: any[], source: string): any => {
      try {
        onEnter(zone);
        return delegate.invoke(target, callback, applyThis, applyArgs, source);
      } finally {
        onLeave(zone);
      }
    },

    ...
  });
}
```

所以当 `onInvoke` 钩子调用了 `run` 的回调的时候，会先后触发  `onEnter(zone);` `onLeave(zone);`：

> angular/packages/core/src/zone/ng_zone.ts

```typescript
function onEnter(zone: NgZonePrivate) {
  zone._nesting++;
  if (zone.isStable) {
    zone.isStable = false;
    zone.onUnstable.emit(null);
  }
}

function onLeave(zone: NgZonePrivate) {
  zone._nesting--;
  checkStable(zone);
}
```

当进入执行栈时，`ngZone._nesting` `++` 离开 `--`

钩子函数 `onInvoke` 又调用了 `delegate: ZoneDelegate` 既 `angular zone` 的父级 `<Zone>zone` 的 `invoke` 方法：

> zone.js/lib/zone.ts

```typescript
class ZoneDelegate implements AmbientZoneDelegate {
  invoke(
        targetZone: Zone, callback: Function, applyThis: any, applyArgs?: any[],
        source?: string): any {
      return this._invokeZS ? this._invokeZS.onInvoke!
                              (this._invokeDlgt!, this._invokeCurrZone!, targetZone, callback,
                               applyThis, applyArgs, source) :
                              callback.apply(applyThis, applyArgs);
    }
}
```

但是因为 `<root>Zone` 没有 `ZoneDelegate` ，所以只是执行了 `callback.apply(applyThis, applyArgs);`

那么为什么这么做呢，**让 `onInvoke` 递归调用 `delegate.invoke`** ？

因为 `Zone` 实例其实是个树形结构

**我猜测 angular 想让执行时经过层层传递触发每一个父级 `Zone` 的代理对象并触发相应的钩子函数调起对应的操作，最后交由根代理对象来执行真正的回调函数**。


所以稍微总结下： 

1. `ngZone.run` 其实就是调用了创建的 angular zone 的 `run` 方法
2. `zone.run` 又调用了 fork angular 的时候传入的配置 `onInvoke` 钩子
3. 配置 `onInvoke` 钩子又执行了传入 `run` 的回调**即：`onInvoke` 钩子执行了创建模块和组件的函数**
4. **类似 AOP ，在 `onInvoke` 执行回调时切入切面，会通过 `onEnter(zone);` `onLeave(zone);` 来用 `EventEmitter` 通知 angular**

到此为止，初始化好了 zone 的运行环境


## 总结

用人话总结下：

1. 在 zone.js 被引入时，**自执行函数 `Zone` 创建 `<root>Zone`**
2. 在 zone.js 被引入时，**执行替换原生异步API的补丁**
3. `bootstrapModuleFactory` 在引导根模块时，先会用 `getNgZone` 从 `<root>Zone` 出一个 `angular Zone`，并设置几个钩子
4. 调用 `ngZone.run` 并传入实例化模块工厂和组件的回调函数
5. `ngZone.run` 调用 `angular Zone` 的 `run` 方法
6. `angular Zone` 的 **`run` 方法调用 `fork` 出 `angular Zone` 时传入的配置中的 `onInvoke` 执行**
7. `angular Zone` 的 **`onInvoke` 触发进入/离开切面的操作，并调起父级 zone 的代理的 `onInvoke` 钩子函数**
8. **由子 `Zone` 到祖 `Zone` 递归执行 `onInvoke` 钩子，触发对应的切面函数**
9. 最后**由 `<root>Zone` 执行实例化模块工厂和组件的回调函数**
