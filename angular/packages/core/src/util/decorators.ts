/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Type} from '../interface/type';

/**
 * An interface implemented by all Angular type decorators, which allows them to be used as ES7
 * decorators as well as
 * Angular DSL syntax.
 *
 * ES7 syntax:
 *
 * ```
 * @ng.Component({...})
 * class MyClass {...}
 * ```
 *
 * @publicApi
 */
export interface TypeDecorator {
  /**
   * Invoke as ES7 decorator.
   */
  <T extends Type<any>>(type: T): T;

  // Make TypeDecorator assignable to built-in ParameterDecorator type.
  // ParameterDecorator is declared in lib.d.ts as a `declare type`
  // so we cannot declare this interface as a subtype.
  // see https://github.com/angular/angular/issues/3379#issuecomment-126169417
  (target: Object, propertyKey?: string|symbol, parameterIndex?: number): void;
}

export const ANNOTATIONS = '__annotations__';
export const PARAMETERS = '__parameters__';
export const PROP_METADATA = '__prop__metadata__';

/**
 * @suppress {globalThis}
 */
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
