[直接看人话总结](#总结)

## angular 模块

[官方介绍](https://www.angular.cn/guide/ngmodules)

`NgModule` 是一个带有 `@NgModule` 装饰器的类。 

`@NgModule` 的参数是一个元数据对象，用于描述如何编译组件的模板，以及如何在运行时创建注入器。

它会标出该模块自己的组件、指令和管道，通过 `exports` 属性公开其中的一部分，以便外部组件使用它们。

`NgModule` 还能把一些服务提供商添加到应用的依赖注入器中。

在之前的例子中，我们通过 `platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));` 引导初始化时，`bootstrapModule` 方法传入的第一个参数就是angular 模块 `NgModule`。


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

### makeDecorator

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
3. `parentClass?: any` 父类
4. `additionalProcessing?: (type: Type<T>) => void` 对类构造函数进行额外处理，**参数是装饰器的宿主类的构造函数**
5. `typeFn?: (type: Type<T>, ...args: any[]) => void)` 在装饰器的返回函数中，会再次执行下回调函数，参数是**类构造函数和参数**

在这里 `makeDecorator` 基本上做了这几个事情：

1. 通过 `makeMetadataCtor` 创建一个给类构造函数附加初始值的函数
2. 如果 `this` 是注解工厂 `DecoratorFactory` 的实例，则通过上面给类构造函数附加初始值的函数，传入 `this` 和装饰器参数 `args`
3. 此外则先执行 `typeFn` 传入类构造函数和参数，修改类构造函数
4. 先传入**参数创建注解工厂 `DecoratorFactory` 的实例** ，注解实例会递归执行，直到 `this` 是注解工厂 `DecoratorFactory` 的实例 （**注解工厂 `DecoratorFactory` 的实例实际上就是装饰器的参数**）
5. 判断类构造函数是否存在 `__annotations__` 属性，把**装饰器处理结果（注解实例）保存在类构造函数的 `__annotations__` 属性数组中**

实际上，`makeDecorator` 的作用就是**构造返回一个函数 `DecoratorFactory`**用作 [装饰器](https://www.tslang.cn/docs/handbook/decorators.html)，并**创建装饰器工厂 `DecoratorFactory` 实例。**

最后可以打印下 `(AppModule as any).__annotations__` 来进行验证，这就是存在模块类上的注解实例。




## 总结


1. 
