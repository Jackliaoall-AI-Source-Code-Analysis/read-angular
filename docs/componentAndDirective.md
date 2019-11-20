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
  entryComponents?: Array<Type<any>|any[]>; // 告诉ng编译器不在template但是也要编译的组件，一般用于动态组件
  preserveWhitespaces?: boolean;
}
```

其实这样就很清楚了，组件实际上是继承指令，并且拓展了一些视图UI的属性。

有一个属性很牛逼啊，`entryComponents`：**当一些组件只能动态加载，并不会在组件模板中引用，这个属性会告诉编译器也要一起编译**。

但是我觉得这个可能是**ng要干掉模块的用来替换组件声明的地方了**。


## 编译指令和组件

首先回到 `JitCompiler` 这一步，看下编译的时候对组件和指令做了什么

> angular/packages/compiler/src/jit/compiler.ts

```typescript
class JitCompiler {
  // 注释：编译主模块上的所有组件和指令
  // 主要目的：拿到 组件的模板、入口组件的模板、组件的入口组件的模板(原来组件也有入口组件)，最终拿到了所有涉及的模板，放在 templates 中
  _compileComponents(mainModule: Type, allComponentFactories: object[]|null) {
    // 注释：获取主模块的元数据
    const ngModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    console.log(3412312312, mainModule, ngModule);
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








## 总结

