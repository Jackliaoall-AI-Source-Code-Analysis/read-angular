[直接看人话总结](#总结)

## 组件和指令

[组件官方介绍](https://www.angular.cn/api/core/Component)

[指令官方介绍](https://www.angular.cn/api/core/Directive)

指令 `Directive` 是一个带有 `@Directive` 装饰器的类。 

组件 `Component` 是一个带有 `@Component` 装饰器的类。 

> angular/packages/core/src/metadata/directives.ts

```typescript
export interface Directive {
  selector?: string; // 标签选择器
  inputs?: string[]; // 输入的属性
  outputs?: string[]; // 输出的事件
  providers?: Provider[]; // 服务提供者，一组依赖注入令牌，它允许 DI 系统为这个指令或组件提供依赖
  exportAs?: string; // 导出别名可以在模板使用，避免重名
  queries?: {[key: string]: any}; // 配置指令查询，将被注入到指令中
  host?: {[key: string]: string}; // 使用一组键-值对，把类的属性映射到宿主元素的绑定（Property、Attribute 和事件）
  jit?: true; // 如果为 true，则该指令/组件将会被 AOT 编译器忽略，始终使用 JIT 编译
}

export interface Component extends Directive {
  changeDetection?: ChangeDetectionStrategy; // 变更检测的策略，ChangeDetectionStrategy.Onpush可以手动, ChangeDetectionStrategy.Default默认自动
  viewProviders?: Provider[]; // 定义一组可注入对象，它们在视图的各个子节点中可用（设置组件及其子组件(不含ContentChildren)可以用的服务）
  moduleId?: string; // 包含该组件的那个模块的 ID。该组件必须能解析模板和样式表中使用的相对 URL。 SystemJS 在每个模块中都导出了 __moduleName 变量。在 CommonJS 中，它可以设置为 module.id。
  templateUrl?: string; // 模板地址
  template?: string; // 字符串模板
  styleUrls?: string[]; // 样式文件地址
  styles?: string[]; // 字符串样式
  animations?: any[]; // 动画
  encapsulation?: ViewEncapsulation; // 供模板和 CSS 样式使用的样式封装策略
  interpolation?: [string, string]; // 改写默认的插值表达式起止分界符（{{ 和 }}）
  entryComponents?: Array<Type<any>|any[]>; // 一个组件的集合，它应该和当前组件一起编译 (我觉得这个可能是ng要干掉模块的地方了)
  preserveWhitespaces?: boolean;
}
```

其实这样就很清楚了，组件实际上是继承指令，并且拓展了一些视图UI的属性。


## 编译组件和指令

首先回到 `JitCompiler` 这一步，看下初始化的时候做了什么

### 获取指令组件元数据

`_compileModuleAndComponents` 编译模块和组件的方法里，先调用加载模块的方法获取了指令组件元数据

```typescript
class JitCompiler {
  private _compileModuleAndComponents(moduleType: Type, isSync: boolean): SyncAsync<object> {
    // 注释：其实调用的是这步，编译主模块和组件
    return SyncAsync.then(this._loadModules(moduleType, isSync), () => {  // 注释：先加载模块
      this._compileComponents(moduleType, null); // 注释：异步有结果之后的回调函数，编译主模块上的所有入口组件 
      return this._compileModule(moduleType); // 注释：返回编译后的模块工厂
    });
  }

  // 注释：异步加载解析主模块，也就是 bootstrap 的 ngModule
  // 最后所有被导入 AppModule 关联的模块的元数据都已经加载进了缓存中，包括了从 AppModule 开始除了懒加载模块之外的的整个模块树，树上的所有指令，组件和管道，以及所有的服务
  private _loadModules(mainModule: any, isSync: boolean): SyncAsync<any> {
    const loading: Promise<any>[] = [];
    // 注释：从元数据中获得根模块的 __annotations__ 并格式化
    const mainNgModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;

    // 注释：过滤 AOT 模块并异步编加载数据中全部指令组件和和管道
    // Note: for runtime compilation, we want to transitively compile all modules,
    // so we also need to load the declared directives / pipes for all nested modules.
    // 注释：过滤掉根模块元数据中的 AOT 模块
    this._filterJitIdentifiers(mainNgModule.transitiveModule.modules).forEach((nestedNgModule) => {
      // getNgModuleMetadata only returns null if the value passed in is not an NgModule
      const moduleMeta = this._metadataResolver.getNgModuleMetadata(nestedNgModule) !;
      this._filterJitIdentifiers(moduleMeta.declaredDirectives).forEach((ref) => {
        // 注释：异步编加载数据中全部指令组件和和管道
        const promise =
            // 这里先提取指令和组件的元数据
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
}
```







## 总结

