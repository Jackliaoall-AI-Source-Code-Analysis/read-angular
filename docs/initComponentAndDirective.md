[直接看人话总结](#总结)

## 初始化组件和指令

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

![组件和指令的关系](https://raw.githubusercontent.com/DimaLiLongJi/read-angular/master/docs/img/angular-directive-component.png)

有一个属性很牛逼啊，`entryComponents`：**当一些组件只能动态加载，并不会在组件模板中引用，这个属性会告诉编译器也要一起编译**。

但是我觉得这个可能是**ng要干掉模块的用来替换组件声明的地方了**。

然后回到之前的 `JitCompiler` ，这里开始解析编译组件指令：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
class JitCompiler {
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

做了三件事: 
1. 加载模块 `this._loadModules`
2. 编译组件 `this._compileComponents`
3. 编译模块 `this._compileModule`


## 解析指令和组件

首先解析指令和组件的实现在这里：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
class JitCompiler {
  // 注释：异步加载解析主模块，也就是 bootstrap 的 ngModule
  // 最后所有被导入 AppModule 关联的模块的元数据都已经加载进了缓存中，包括了从 AppModule 开始除了懒加载模块之外的的整个模块树，树上的所有指令，组件和管道，以及所有的服务
  private _loadModules(mainModule: any, isSync: boolean): SyncAsync<any> {
    const loading: Promise<any>[] = [];
    // 注释：从元数据中获得根模块的 __annotations__ 并格式化
    const mainNgModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    // 注释：过滤 AOT 模块并异步编加载数据中全部模块传递过来的指令组件和和管道
    // Note: for runtime compilation, we want to transitively compile all modules,
    // so we also need to load the declared directives / pipes for all nested modules.
    // 注释：过滤掉根模块元数据中的 AOT 模块
    this._filterJitIdentifiers(mainNgModule.transitiveModule.modules).forEach((nestedNgModule) => {
      // getNgModuleMetadata only returns null if the value passed in is not an NgModule
      // 注释：获取模块的元数据
      const moduleMeta = this._metadataResolver.getNgModuleMetadata(nestedNgModule) !;
      this._filterJitIdentifiers(moduleMeta.declaredDirectives).forEach((ref) => {
        // 注释：异步编加载数据中全部指令组件和和管道
        const promise =
            // 这里先提取所有指令和组件的元数据，并把元数据中的 template 字符串编译成 htmlAST
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

首先回到 `JitCompiler` 这一步，看下编译的时候对组件和指令做了什么：

其实是在这里，`_loadModules` 在加载模模块的时候，

会调用元数据解析器 `this._metadataResolver.loadDirectiveMetadata` 
  1. 解析组件和指令，提取元数据，
  2. 把 `template` 编译成 `htmlAST`

我们来看下解析指令组件的时候发生了什么，

### 指令组件元数据解析器

`_metadataResolver.loadDirectiveMetadata` 的实现在这里：

> angular/packages/compiler/src/metadata_resolver.ts

```typescript
export class CompileMetadataResolver {
  loadDirectiveMetadata(ngModuleType: any, directiveType: any, isSync: boolean): SyncAsync<null> {
    if (this._directiveCache.has(directiveType)) {
      return null;
    }
    directiveType = resolveForwardRef(directiveType);
    // 把指令和组件类解析成类解析成注解和元数据
    const {annotation, metadata} = this.getNonNormalizedDirectiveMetadata(directiveType) !;

    const createDirectiveMetadata = (templateMetadata: cpl.CompileTemplateMetadata | null) => {
      const normalizedDirMeta = new cpl.CompileDirectiveMetadata({
        isHost: false,
        type: metadata.type,
        isComponent: metadata.isComponent,
        selector: metadata.selector,
        exportAs: metadata.exportAs,
        changeDetection: metadata.changeDetection,
        inputs: metadata.inputs,
        outputs: metadata.outputs,
        hostListeners: metadata.hostListeners,
        hostProperties: metadata.hostProperties,
        hostAttributes: metadata.hostAttributes,
        providers: metadata.providers,
        viewProviders: metadata.viewProviders,
        queries: metadata.queries,
        guards: metadata.guards,
        viewQueries: metadata.viewQueries,
        entryComponents: metadata.entryComponents,
        componentViewType: metadata.componentViewType,
        rendererType: metadata.rendererType,
        componentFactory: metadata.componentFactory,
        template: templateMetadata
      });
      if (templateMetadata) {
        this.initComponentFactory(metadata.componentFactory !, templateMetadata.ngContentSelectors);
      }
      // 注释：存入缓存，后续直接读缓存
      this._directiveCache.set(directiveType, normalizedDirMeta);
      this._summaryCache.set(directiveType, normalizedDirMeta.toSummary());
      return null;
    };

    if (metadata.isComponent) {
      const template = metadata.template !;
      // 注释：这里会把 template 字符串解析成 htmlAst
      // 这个日后再讲
      const templateMeta = this._directiveNormalizer.normalizeTemplate({
        ngModuleType,
        componentType: directiveType,
        moduleUrl: this._reflector.componentModuleUrl(directiveType, annotation),
        encapsulation: template.encapsulation,
        template: template.template,
        templateUrl: template.templateUrl,
        styles: template.styles,
        styleUrls: template.styleUrls,
        animations: template.animations,
        interpolation: template.interpolation,
        preserveWhitespaces: template.preserveWhitespaces
      });
      if (isPromise(templateMeta) && isSync) {
        this._reportError(componentStillLoadingError(directiveType), directiveType);
        return null;
      }
      console.log(31234134, template, templateMeta);
      return SyncAsync.then(templateMeta, createDirectiveMetadata);
    } else {
      // directive
      createDirectiveMetadata(null);
      return null;
    }
  }
}
```

解析：

1. 首先会调用方法 `getNonNormalizedDirectiveMetadata` 编把组件解析成元数据和注解数据
   1. `getNonNormalizedDirectiveMetadata` 会先从缓存中获取元数据，如有存在则直接返回
   2. 然后通过 `this._directiveResolver.resolve`（**此时 `templateUrl` 已经被解析为 `template` 字符串**）
   3. 如果是组件则继续确认 `styles` `styleUrls` 等元属性
   4. **存入缓存 `_directiveCache` `_summaryCache` 中，后续可以直接从缓存中那解析结果**
   5. 最后返回**带组件工厂和渲染器 `renderer` 的元数据**

    > angular/packages/compiler/src/metadata_resolver.ts

    ```typescript
    export class CompileMetadataResolver {

     // 注释：解析组件为注解和元数据
     getNonNormalizedDirectiveMetadata(directiveType: any):
         {annotation: Directive, metadata: cpl.CompileDirectiveMetadata}|null {
       directiveType = resolveForwardRef(directiveType);
       if (!directiveType) {
         return null;
       }
       let cacheEntry = this._nonNormalizedDirectiveCache.get(directiveType);
       if (cacheEntry) {
         return cacheEntry;
       }
       // 注释：解析出指令组件元数据 
       // {
       //   exportAs: "routerLinkActive"
       //   guards: {}
       //   host: {}
       //   inputs: (2) ["routerLinkActiveOptions", "routerLinkActive"]
       //   ngMetadataName: "Directive"
       //   outputs: []
       //   providers: undefined
       //   queries: {links: PropDecoratorFactory, linksWithHrefs: PropDecoratorFactory}
       //   selector: "[routerLinkActive]"
       // }
       const dirMeta = this._directiveResolver.resolve(directiveType, false);
       if (!dirMeta) {
         return null;
       }
       let nonNormalizedTemplateMetadata: cpl.CompileTemplateMetadata = undefined !;

       if (createComponent.isTypeOf(dirMeta)) {
         // component
         const compMeta = dirMeta as Component;
         assertArrayOfStrings('styles', compMeta.styles);
         assertArrayOfStrings('styleUrls', compMeta.styleUrls);
         assertInterpolationSymbols('interpolation', compMeta.interpolation);

         const animations = compMeta.animations;

         nonNormalizedTemplateMetadata = new cpl.CompileTemplateMetadata({
           encapsulation: noUndefined(compMeta.encapsulation),
           template: noUndefined(compMeta.template),
           templateUrl: noUndefined(compMeta.templateUrl),
           htmlAst: null,
           styles: compMeta.styles || [],
           styleUrls: compMeta.styleUrls || [],
           animations: animations || [],
           interpolation: noUndefined(compMeta.interpolation),
           isInline: !!compMeta.template,
           externalStylesheets: [],
           ngContentSelectors: [],
           preserveWhitespaces: noUndefined(dirMeta.preserveWhitespaces),
         });
       }

       let changeDetectionStrategy: ChangeDetectionStrategy = null !;
       let viewProviders: cpl.CompileProviderMetadata[] = [];
       let entryComponentMetadata: cpl.CompileEntryComponentMetadata[] = [];
       let selector = dirMeta.selector;

       if (createComponent.isTypeOf(dirMeta)) {
         // Component
         const compMeta = dirMeta as Component;
         changeDetectionStrategy = compMeta.changeDetection !;
         if (compMeta.viewProviders) {
           viewProviders = this._getProvidersMetadata(
               compMeta.viewProviders, entryComponentMetadata,
               `viewProviders for "${stringifyType(directiveType)}"`, [], directiveType);
         }
         if (compMeta.entryComponents) {
           entryComponentMetadata = flattenAndDedupeArray(compMeta.entryComponents)
                                        .map((type) => this._getEntryComponentMetadata(type) !)
                                        .concat(entryComponentMetadata);
         }
         if (!selector) {
           selector = this._schemaRegistry.getDefaultComponentElementName();
         }
       } else {
         // Directive
         if (!selector) {
           this._reportError(
               syntaxError(
                   `Directive ${stringifyType(directiveType)} has no selector, please add it!`),
               directiveType);
           selector = 'error';
         }
       }

       let providers: cpl.CompileProviderMetadata[] = [];
       if (dirMeta.providers != null) {
         providers = this._getProvidersMetadata(
             dirMeta.providers, entryComponentMetadata,
             `providers for "${stringifyType(directiveType)}"`, [], directiveType);
       }
       let queries: cpl.CompileQueryMetadata[] = [];
       let viewQueries: cpl.CompileQueryMetadata[] = [];
       if (dirMeta.queries != null) {
         queries = this._getQueriesMetadata(dirMeta.queries, false, directiveType);
         viewQueries = this._getQueriesMetadata(dirMeta.queries, true, directiveType);
       }

       const metadata = cpl.CompileDirectiveMetadata.create({
         isHost: false,
         selector: selector,
         exportAs: noUndefined(dirMeta.exportAs),
         isComponent: !!nonNormalizedTemplateMetadata,
         type: this._getTypeMetadata(directiveType),
         template: nonNormalizedTemplateMetadata,
         changeDetection: changeDetectionStrategy,
         inputs: dirMeta.inputs || [],
         outputs: dirMeta.outputs || [],
         host: dirMeta.host || {},
         providers: providers || [],
         viewProviders: viewProviders || [],
         queries: queries || [],
         guards: dirMeta.guards || {},
         viewQueries: viewQueries || [],
         entryComponents: entryComponentMetadata,
         componentViewType: nonNormalizedTemplateMetadata ? this.getComponentViewClass(directiveType) :
                                                            null,
         rendererType: nonNormalizedTemplateMetadata ? this.getRendererType(directiveType) : null,
         componentFactory: null
       });
       if (nonNormalizedTemplateMetadata) {
         metadata.componentFactory =
             this.getComponentFactory(selector, directiveType, metadata.inputs, metadata.outputs);
       }
       cacheEntry = {metadata, annotation: dirMeta};
       this._nonNormalizedDirectiveCache.set(directiveType, cacheEntry);
       return cacheEntry;
     }
    }
    ```
2. 获取元属性之后，如果为组件的话，则会通过 `this._directiveNormalizer.normalizeTemplate` 把组件元数据中的 `template` 解析为 `htmlAst` （这个日后再深入研究）

```typescript
const templateMeta = this._directiveNormalizer.normalizeTemplate({
  ngModuleType,
  componentType: directiveType,
  moduleUrl: this._reflector.componentModuleUrl(directiveType, annotation),
  encapsulation: template.encapsulation,
  template: template.template,
  templateUrl: template.templateUrl,
  styles: template.styles,
  styleUrls: template.styleUrls,
  animations: template.animations,
  interpolation: template.interpolation,
  preserveWhitespaces: template.preserveWhitespaces
});
```

3. 返回解析过的组件和指令

### 获取指令组件类注解和属性注解的元数据

在上面 `this._directiveResolver.resolve` ，获取了组件类注解的元数据和组件属性注解的元数据，实现在这里：

> angular/packages/compiler/src/directive_resolver.ts

```typescript
export class DirectiveResolver {
  constructor(private _reflector: CompileReflector) {}

  /**
   * Return {@link Directive} for a given `Type`.
   */
  resolve(type: Type): Directive;
  resolve(type: Type, throwIfNotFound: true): Directive;
  resolve(type: Type, throwIfNotFound: boolean): Directive|null;
  resolve(type: Type, throwIfNotFound = true): Directive|null {
    // 注释：通过类的反射获取注解 注解位于静态属性 __annotations__
    // 注释：此时templateUrl已经成为template字符串
    // ngMetadataName 在原型链中
    // {
    //   changeDetection: 1
    //   selector: "app-root"
    //   styles: ["↵/*# sourceMappingURL=data:application/json;base64…ZpbGUiOiJzcmMvYXBwL2FwcC5jb21wb25lbnQubGVzcyJ9 */"]
    //   template: "<!--The content below is only a placeholder and can be replaced.-->↵<div style="text-align:center">↵  <h1>↵    Welcome to {{ title }}!↵  </h1>↵  <img width="300" alt="Angular Logo" src=
    //   __proto__: {
    //     ngMetadataName: "Component"
    //   }
    // }
    const typeMetadata = this._reflector.annotations(resolveForwardRef(type));
    if (typeMetadata) {
      // 筛选元数据，把非属性元数据过滤掉
      const metadata = findLast(typeMetadata, isDirectiveMetadata);
      if (metadata) {
        // 获取prop元数据（其实就是类被注解过的属性） 位于静态属性 __prop__metadata__ 上
        // ngMetadataName 在原型链中
        // {
        //   testValue: [
        //     bindingPropertyName: "testValue"
        //   ],
        //   __proto__: {
        //     ngMetadataName: "Input"
        //   }
        // }
        const propertyMetadata = this._reflector.propMetadata(type);
        const guards = this._reflector.guards(type);
        return this._mergeWithPropertyMetadata(metadata, propertyMetadata, guards, type);
      }
    }

    if (throwIfNotFound) {
      throw new Error(`No Directive annotation found on ${stringify(type)}`);
    }

    return null;
  }
}
```

1. 首先通过反射器获取了**组件和指令的类注解元数据** `this._reflector.annotations(resolveForwardRef(type))`
2. 接下来删选元数据，把非属性元数据过滤掉
3. 然后**获取了 `prop元数据`（像通过 `@Input` 这种属性注解的元数据）和 `guards` 守卫元数据（目前看是空对象）**
4. 最后把类注解元数据属性注解元数据等进行合并并返回

可以看到指令解析器注入了一个编译反射器 `CompileReflector` ，**该反射器负责提取类注解、属性注解的元数据**，而**解析器主要通过该反射器获取元数据**。

### CompileReflector

`CompileReflector` 是实现是 `JitReflector` ：

> angular/packages/platform-browser-dynamic/src/compiler_reflector.ts

```typescript
export class JitReflector implements CompileReflector {
  private reflectionCapabilities = new ReflectionCapabilities();

  componentModuleUrl(type: any, cmpMetadata: Component): string {
    const moduleId = cmpMetadata.moduleId;

    if (typeof moduleId === 'string') {
      const scheme = getUrlScheme(moduleId);
      return scheme ? moduleId : `package:${moduleId}${MODULE_SUFFIX}`;
    } else if (moduleId !== null && moduleId !== void 0) {
      throw syntaxError(
          `moduleId should be a string in "${stringify(type)}". See https://goo.gl/wIDDiL for more information.\n` +
          `If you're using Webpack you should inline the template and the styles, see https://goo.gl/X2J8zc.`);
    }

    return `./${stringify(type)}`;
  }

  parameters(typeOrFunc: /*Type*/ any): any[][] {
    return this.reflectionCapabilities.parameters(typeOrFunc);
  }
  tryAnnotations(typeOrFunc: /*Type*/ any): any[] { return this.annotations(typeOrFunc); }
  // 注释：获取类的ANNOTATIONS 类静态属性 __annotations__
  annotations(typeOrFunc: /*Type*/ any): any[] {
    return this.reflectionCapabilities.annotations(typeOrFunc);
  }
  shallowAnnotations(typeOrFunc: /*Type*/ any): any[] {
    throw new Error('Not supported in JIT mode');
  }
  // 注释：获取类的ANNOTATIONS 类静态属性 __prop__metadata__
  propMetadata(typeOrFunc: /*Type*/ any): {[key: string]: any[]} {
    return this.reflectionCapabilities.propMetadata(typeOrFunc);
  }
  // 注释：查看并获取声明周期钩子函数，从 type.prototype 类的原型上获取
  hasLifecycleHook(type: any, lcProperty: string): boolean {
    return this.reflectionCapabilities.hasLifecycleHook(type, lcProperty);
  }
  guards(type: any): {[key: string]: any} { return this.reflectionCapabilities.guards(type); }
  resolveExternalReference(ref: ExternalReference): any {
    return builtinExternalReferences.get(ref) || ref.runtime;
  }
}
```

`JitReflector` 则是通过核心 `ReflectionCapabilities` 实例方法获取组件和指令的元数据

> angular/packages/core/src/reflection/reflection_capabilities.ts

```typescript
export class ReflectionCapabilities implements PlatformReflectionCapabilities {
  private _reflect: any;

  constructor(reflect?: any) { this._reflect = reflect || global['Reflect']; }

  ...

  // 注释：获得类的注解
  private _ownAnnotations(typeOrFunc: Type<any>, parentCtor: any): any[]|null {
    // Prefer the direct API.
    if ((<any>typeOrFunc).annotations && (<any>typeOrFunc).annotations !== parentCtor.annotations) {
      let annotations = (<any>typeOrFunc).annotations;
      if (typeof annotations === 'function' && annotations.annotations) {
        annotations = annotations.annotations;
      }
      return annotations;
    }

    // API of tsickle for lowering decorators to properties on the class.
    if ((<any>typeOrFunc).decorators && (<any>typeOrFunc).decorators !== parentCtor.decorators) {
      return convertTsickleDecoratorIntoMetadata((<any>typeOrFunc).decorators);
    }

    // API for metadata created by invoking the decorators.
    if (typeOrFunc.hasOwnProperty(ANNOTATIONS)) {
      // 注释：类的注解元数据数据，放在类的静态属性 __annotations__ 下
      return (typeOrFunc as any)[ANNOTATIONS];
    }
    return null;
  }

  annotations(typeOrFunc: Type<any>): any[] {
    if (!isType(typeOrFunc)) {
      return [];
    }
    const parentCtor = getParentCtor(typeOrFunc);
    // 注释：获取类的 ANNOTATIONS 
    const ownAnnotations = this._ownAnnotations(typeOrFunc, parentCtor) || [];
    const parentAnnotations = parentCtor !== Object ? this.annotations(parentCtor) : [];
    return parentAnnotations.concat(ownAnnotations);
  }
  ...

  // 注释：获取属性元数据
  propMetadata(typeOrFunc: any): {[key: string]: any[]} {
    if (!isType(typeOrFunc)) {
      return {};
    }
    const parentCtor = getParentCtor(typeOrFunc);
    const propMetadata: {[key: string]: any[]} = {};
    if (parentCtor !== Object) {
      const parentPropMetadata = this.propMetadata(parentCtor);
      Object.keys(parentPropMetadata).forEach((propName) => {
        propMetadata[propName] = parentPropMetadata[propName];
      });
    }
    const ownPropMetadata = this._ownPropMetadata(typeOrFunc, parentCtor);
    if (ownPropMetadata) {
      Object.keys(ownPropMetadata).forEach((propName) => {
        const decorators: any[] = [];
        if (propMetadata.hasOwnProperty(propName)) {
          decorators.push(...propMetadata[propName]);
        }
        decorators.push(...ownPropMetadata[propName]);
        propMetadata[propName] = decorators;
      });
    }
    return propMetadata;
  }

  // 注释：类的原型链上查找是否有该生命周期，如果有则返回该生命周期
  // 因为 `interface` 在编译器之后就不存在了
  // 所以目测 `angular`会把遍历使用该所有生命周期的名字，然后获取组件拥有的所有生命周期
  hasLifecycleHook(type: any, lcProperty: string): boolean {
    return type instanceof Type && lcProperty in type.prototype;
  }

  guards(type: any): {[key: string]: any} { return {}; }
  ...
}
```

这里重点看下几个方法：

1. `annotations`：类注解， 通过类的静态属性 `__annotations__` 获取
2. `propMetadata`：类属性注解， 通过类的静态属性 `__prop__metadata__` 获取
3. `guards`：守卫，目前看是空
4. `hasLifecycleHook`：从**类的原型链上查找是否有该生命周期，如果有则返回该生命周期**，这里应该是 `angular` 编译获取生命周期钩子的地方(**因为 `interface` 在编译器之后就不存在了，所以目测 `angular`会把遍历使用该所有生命周期的名字，然后获取组件拥有的所有生命周期**)

该反射解析器还用了**反射 `Reflect` 获取一些数据**，但是目前暂时没遇到，所以暂不解析。

至于这里为什么要从类的静态属性获得注解消息，之前的文章已经说过了，来回顾下：

1. 类注解（例如：`@Component`）

通过 `Object.defineProperty(cls, ANNOTATIONS, {value: []})[ANNOTATIONS]` `annotations.push(annotationInstance);` 把元数据存储在类原型上的属性 `__annotations__`

> angular/packages/core/src/util/decorators.ts

```typescript
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
      // 注释：如果有旧设置没有就创建一个属性
      const annotations = cls.hasOwnProperty(ANNOTATIONS) ?
          (cls as any)[ANNOTATIONS] :
          Object.defineProperty(cls, ANNOTATIONS, {value: []})[ANNOTATIONS];
      annotations.push(annotationInstance); // 注释：将装饰器的处理结果保存

      if (additionalProcessing) additionalProcessing(cls);

      return cls;
    };
  }

  if (parentClass) {
    // 注释：使实例 DecoratorFactory 继承继承 parentClass
    DecoratorFactory.prototype = Object.create(parentClass.prototype);
  }

  // 注释：装饰器名称会被放在原型属性 ngMetadataName 上
  DecoratorFactory.prototype.ngMetadataName = name;
  (DecoratorFactory as any).annotationCls = DecoratorFactory;
  return DecoratorFactory as any;
}
```

2. 构造函数参数注解（例如 `@Inject`、`@Optional`）

通过 `Object.defineProperty(cls, PARAMETERS, {value: []})[PARAMETERS];` 和 `(parameters[index] = parameters[index] || []).push(annotationInstance)` 把元数据存储在类原型上的属性 `__parameters__`

> angular/packages/core/src/util/decorators.ts

```typescript
export function makeParamDecorator(
    name: string, props?: (...args: any[]) => any, parentClass?: any): any {
  const metaCtor = makeMetadataCtor(props);
  function ParamDecoratorFactory(...args: any[]): any {
    if (this instanceof ParamDecoratorFactory) {
      metaCtor.apply(this, args);
      return this;
    }
    const annotationInstance = new (<any>ParamDecoratorFactory)(...args);

    (<any>ParamDecorator).annotation = annotationInstance;
    return ParamDecorator;

    function ParamDecorator(cls: any, unusedKey: any, index: number): any {
      // Use of Object.defineProperty is important since it creates non-enumerable property which
      // prevents the property is copied during subclassing.
      const parameters = cls.hasOwnProperty(PARAMETERS) ?
          (cls as any)[PARAMETERS] :
          Object.defineProperty(cls, PARAMETERS, {value: []})[PARAMETERS];

      // there might be gaps if some in between parameters do not have annotations.
      // we pad with nulls.
      while (parameters.length <= index) {
        parameters.push(null);
      }

      (parameters[index] = parameters[index] || []).push(annotationInstance);
      return cls;
    }
  }
  if (parentClass) {
    ParamDecoratorFactory.prototype = Object.create(parentClass.prototype);
  }
  ParamDecoratorFactory.prototype.ngMetadataName = name;
  (<any>ParamDecoratorFactory).annotationCls = ParamDecoratorFactory;
  return ParamDecoratorFactory;
}
```

3. 属性注解（例如 `@Input`、`@Output`）

通过 `Object.defineProperty(constructor, PROP_METADATA, {value: {}})[PROP_METADATA]` 和 `meta[name] = meta.hasOwnProperty(name) && meta[name] || []` 把元数据存储在类原型上的属性 `__prop__metadata__`

```typescript
export function makePropDecorator(
    name: string, props?: (...args: any[]) => any, parentClass?: any,
    additionalProcessing?: (target: any, name: string, ...args: any[]) => void): any {
  const metaCtor = makeMetadataCtor(props);

  function PropDecoratorFactory(...args: any[]): any {
    if (this instanceof PropDecoratorFactory) {
      metaCtor.apply(this, args);
      return this;
    }

    const decoratorInstance = new (<any>PropDecoratorFactory)(...args);

    function PropDecorator(target: any, name: string) {
      const constructor = target.constructor;
      // Use of Object.defineProperty is important since it creates non-enumerable property which
      // prevents the property is copied during subclassing.
      const meta = constructor.hasOwnProperty(PROP_METADATA) ?
          (constructor as any)[PROP_METADATA] :
          Object.defineProperty(constructor, PROP_METADATA, {value: {}})[PROP_METADATA];
      meta[name] = meta.hasOwnProperty(name) && meta[name] || [];
      meta[name].unshift(decoratorInstance);

      if (additionalProcessing) additionalProcessing(target, name, ...args);
    }

    return PropDecorator;
  }

  if (parentClass) {
    PropDecoratorFactory.prototype = Object.create(parentClass.prototype);
  }

  PropDecoratorFactory.prototype.ngMetadataName = name;
  (<any>PropDecoratorFactory).annotationCls = PropDecoratorFactory;
  return PropDecoratorFactory;
}
```


## 编译指令和组件

在解析完模块和模块中的指令后，在回调中要开始编译组件：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
class JitCompiler {
  // 注释：编译主模块上的所有组件和指令
  // 主要目的：拿到 组件模板编译类，放在 templates 中
  _compileComponents(mainModule: Type, allComponentFactories: object[]|null) {
    // 注释：获取主模块的元数据
    const ngModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    // 注释：jit 模块中所有的指令Map，key为指令组件，value为所属的模块
    const moduleByJitDirective = new Map<any, CompileNgModuleMetadata>();
    // 注释：组件模板编译类的集合
    const templates = new Set<CompiledTemplate>();

    // 注释：过滤AOT模块并返回包括自身和引入模块的所有模块
    const transJitModules = this._filterJitIdentifiers(ngModule.transitiveModule.modules);

    // 注释：编译所有模块中组件，（localMod 是模块的class），顺序为先 import 后 declare 的
    transJitModules.forEach((localMod) => {
      const localModuleMeta = this._metadataResolver.getNgModuleMetadata(localMod) !;
      // 注释：指令和组件都是 declaredDirectives (在angular里 @Component组件 继承了 指令@Directive)
      this._filterJitIdentifiers(localModuleMeta.declaredDirectives).forEach((dirRef) => {
        moduleByJitDirective.set(dirRef, localModuleMeta); // 注释：key为指令组件，value为所属的模块
        // 注释：指令组件的元数据，为 CompileDirectiveMetadata 的实例
        const dirMeta = this._metadataResolver.getDirectiveMetadata(dirRef);
        // 注释：只编译组件
        // 注释：拿到组件的模板，并放在组件的集合 templates：Set 中
        if (dirMeta.isComponent) {
          // 注释：创建并收集组件模板编译类
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

    // 注释：再编译每个组件指令上的entryComponent类
    transJitModules.forEach((localMod) => {
      const localModuleMeta = this._metadataResolver.getNgModuleMetadata(localMod) !;
      // 先编译`declarations`的指令和组件的 `entryComponents` 组件
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
      // 再编译模块上 `entryComponents` 元数据的组件
      localModuleMeta.entryComponents.forEach((entryComponentType) => {
        if (!this.hasAotSummary(entryComponentType.componentType)) {
          const moduleMeta = moduleByJitDirective.get(entryComponentType.componentType) !;
          templates.add(
              this._createCompiledHostTemplate(entryComponentType.componentType, moduleMeta));
        }
      });
    });

    // 注释：执行 _compileTemplate 编译组件模板编译类
    templates.forEach((template) => this._compileTemplate(template));
  }
}
```

这个阶段主要目的是**拿到组件模板编译类**，放在 templates 中，然后再调用编译，编译模板类。

1. 获取主模块的元数据
2. 创建Map `moduleByJitDirective` 收集模块中的 `JIT` 指令组件，创建集合收集模块中所有的组件模板编译类
3. 遍历模块，编译模块上的 `declarations` 元数据的指令和组件
4. 遍历模块，先编译 `declarations` 的指令和组件的 `entryComponents` 组件，再编译模块上 `entryComponents` 元数据的组件
5. 最后遍历模块中所有的组件模板编译类，并顺序执行 `_compileTemplate` 编译组件模板类

### 创建组件的模板编译类

使用 `_createCompiledTemplate` 创建

> angular/packages/compiler/src/jit/compiler.ts

```typescript
function assertComponent(meta: CompileDirectiveMetadata) {
  if (!meta.isComponent) {
    throw new Error(
        `Could not compile '${identifierName(meta.type)}' because it is not a component.`);
  }
}
class JitCompiler {
  // 注释：创建组件编译类
  private _createCompiledTemplate(
      compMeta: CompileDirectiveMetadata, ngModule: CompileNgModuleMetadata): CompiledTemplate {
    // 注释：优先取缓存
    let compiledTemplate = this._compiledTemplateCache.get(compMeta.type.reference);
    if (!compiledTemplate) {
      // 注释：确认是否是组件 isComponent
      assertComponent(compMeta);
      // 创建组件编译类，把组件所属模块（compType），可用的指令和组件（directives），组件元数据包含解析到的DI依赖和生命周期传入（compMeta）
      compiledTemplate = new CompiledTemplate(
          false, compMeta.type, compMeta, ngModule, ngModule.transitiveModule.directives);
      // 注释：放入缓存
      this._compiledTemplateCache.set(compMeta.type.reference, compiledTemplate);
    }
    return compiledTemplate;
  }
}
```

也没做嘛：

1. 通过元数据的 `isComponent` 确认是否是组件
2. 创建一个组件模板编译类 `CompiledTemplate` 并设置到缓存中
3. 返回组件模板编译类

看下组件的编译类，**重点是编译之后的方法 `compiled`**，但不多说，后面会详细讲解组件怎么编译模板的

> angular/packages/compiler/src/jit/compiler.ts

```typescript
// 注释：编译组件类
class CompiledTemplate {
  private _viewClass: Function = null !;
  isCompiled = false;

  constructor(
      public isHost: boolean, public compType: CompileIdentifierMetadata,
      public compMeta: CompileDirectiveMetadata, public ngModule: CompileNgModuleMetadata,
      public directives: CompileIdentifierMetadata[]) {}

  // 注释：编译之后的方法
  compiled(viewClass: Function, rendererType: any) {
    this._viewClass = viewClass;
    (<ProxyClass>this.compMeta.componentViewType).setDelegate(viewClass);
    for (let prop in rendererType) {
      (<any>this.compMeta.rendererType)[prop] = rendererType[prop];
    }
    this.isCompiled = true;
  }
}
```

### 编译组件和指令的模板编译类

然后我们回到 `_compileComponents` 方法，看收集到的组件指令最后被用到了哪里：

> angular/packages/compiler/src/jit/compiler.ts

```typescript
class JitCompiler {
  // 注释：编译主模块上的所有组件和指令
  // 主要目的：拿到 组件模板编译类，放在 templates 中
  _compileComponents(mainModule: Type, allComponentFactories: object[]|null) {
    // 注释：获取主模块的元数据
    const ngModule = this._metadataResolver.getNgModuleMetadata(mainModule) !;
    // 注释：jit 模块中所有的指令Map，key为指令组件，value为所属的模块
    const moduleByJitDirective = new Map<any, CompileNgModuleMetadata>();
    // 注释：组件模板编译类的集合
    const templates = new Set<CompiledTemplate>();

    ...

    // 注释：执行 _compileTemplate 编译组件模板编译类
    templates.forEach((template) => this._compileTemplate(template));
  }
}
```

最后启动了方法 `_compileTemplate` 开始编译

> angular/packages/compiler/src/jit/compiler.ts

```typescript
class JitCompiler {
  // 注释：编译组件和指令
  private _compileTemplate(template: CompiledTemplate) {
    // 如果编译过了则跳出，`isCompiled` 在  `CompiledTemplate` 的 `compiled` 方法中被设置成true
    if (template.isCompiled) {
      return;
    }
    // 组件元数据
    const compMeta = template.compMeta;
    // 外部样式表
    const externalStylesheetsByModuleUrl = new Map<string, CompiledStylesheet>();
    // 输出上下文
    const outputContext = createOutputContext();
    // 解析组件样式表 @Component({styles: styleUrls})
    const componentStylesheet = this._styleCompiler.compileComponent(outputContext, compMeta);
    compMeta.template !.externalStylesheets.forEach((stylesheetMeta) => {
      const compiledStylesheet =
          this._styleCompiler.compileStyles(createOutputContext(), compMeta, stylesheetMeta);
      externalStylesheetsByModuleUrl.set(stylesheetMeta.moduleUrl !, compiledStylesheet);
    });
    this._resolveStylesCompileResult(componentStylesheet, externalStylesheetsByModuleUrl);
    // 解析出传递模块的管道（这里不知道干嘛用的）
    const pipes = template.ngModule.transitiveModule.pipes.map(
        pipe => this._metadataResolver.getPipeSummary(pipe.reference));
    // 解析组件模板，使用template字符串解析并返回解析过的模板AST和使用的管道（这里比较复杂以后再深入看）
    const {template: parsedTemplate, pipes: usedPipes} =
        this._parseTemplate(compMeta, template.ngModule, template.directives);
    // 返回编译的结果，带着一个唯一的视图ID viewClassVar
    // {
    //   rendererTypeVar: undefined,
    //   viewClassVar: "View__EmptyOutletComponent_Host_0"
    // }
    const compileResult = this._viewCompiler.compileComponent(
        outputContext, compMeta, parsedTemplate, ir.variable(componentStylesheet.stylesVar),
        usedPipes);
    const evalResult = this._interpretOrJit(
        templateJitUrl(template.ngModule.type, template.compMeta), outputContext.statements);
    // 一个视图类，返回JIT的视图
    const viewClass = evalResult[compileResult.viewClassVar];
    const rendererType = evalResult[compileResult.rendererTypeVar];
    // 编译完成，设置视图类并把模板编译类的isCompiled设置为true，执行会开始更新或者创建视图
    template.compiled(viewClass, rendererType);
  }

  // 注释：编译组件模板，返回模板AST
  private _parseTemplate(
      compMeta: CompileDirectiveMetadata, ngModule: CompileNgModuleMetadata,
      directiveIdentifiers: CompileIdentifierMetadata[]):
      {template: TemplateAst[], pipes: CompilePipeSummary[]} {
    // Note: ! is ok here as components always have a template.
    const preserveWhitespaces = compMeta.template !.preserveWhitespaces;
    const directives =
        directiveIdentifiers.map(dir => this._metadataResolver.getDirectiveSummary(dir.reference));
    const pipes = ngModule.transitiveModule.pipes.map(
        pipe => this._metadataResolver.getPipeSummary(pipe.reference));
    return this._templateParser.parse(
        compMeta, compMeta.template !.htmlAst !, directives, pipes, ngModule.schemas,
        templateSourceUrl(ngModule.type, compMeta, compMeta.template !), preserveWhitespaces);
  }

  // 注释：解析嵌套样式表
  private _resolveStylesCompileResult(
      result: CompiledStylesheet, externalStylesheetsByModuleUrl: Map<string, CompiledStylesheet>) {
    result.dependencies.forEach((dep, i) => {
      const nestedCompileResult = externalStylesheetsByModuleUrl.get(dep.moduleUrl) !;
      const nestedStylesArr = this._resolveAndEvalStylesCompileResult(
          nestedCompileResult, externalStylesheetsByModuleUrl);
      dep.setValue(nestedStylesArr);
    });
  }
}
```

这个地方就粗略讲下做了什么：

1. 获得组件元数据、创建外部样式表，输出上下文
2. 解析组件样式表，（比如 `@Component({})` 中的 `styles`，`styleUrls`）
3. 解析出传递模块的管道，**但是这里没有被使用，这里不知道干嘛用的**
4. 解析组件模板，**使用template字符串解析并返回解析过的模板AST和使用的管道**（这里是用来**抽象语法树AST**比较复杂以后再深入看）
5. 解析出一个 `JIT` 视图类，返回视图
6. 编译完成，设置视图类并把模板编译类的属性已编译 `isCompiled `设置为 `true`，执行会开始更新或者创建视图


## 总结

