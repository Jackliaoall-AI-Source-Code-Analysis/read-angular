# read-angular

angular 源码阅读

[项目地址](https://github.com/DimaLiLongJi/read-angular)

[文章地址](https://dimalilongji.github.io/read-angular)

[angular 版本：8.0.0-rc.4](https://github.com/angular/angular/tree/8.0.0-rc.4)

[欢迎看看我的类angular框架](https://github.com/DimaLiLongJi/InDiv)


## 关于为什么写这么一个项目

**声明：仅仅为个人阅读源码的理解，不一定完全正确，还需要大佬的指点。**

其实市面上很多关于 vue和react 的源码阅读，但是基本上没有看到关于 angular 系统性地源码阅读。

而且大部分人一听说 angular 就会本能地避开。

![angular三连](https://raw.githubusercontent.com/DimaLiLongJi/read-angular/master/docs/img/angular%E4%B8%89%E8%BF%9E.png)

但其实不是的，在我眼里 angular 只是套用了很多后端已有的概念，比如 DI，比如 AOT 等。

之前我写过一个类 angular 的框架 [InDiv](https://github.com/DimaLiLongJi/InDiv)，基本上实现了大多数 ng 的装饰器。

而且在写这个项目的时候，我从 angular 上学到了很多。

这次，则希望通过阅读 angular 的源代码，学习到更多谷歌在设计模式上的运用，学习到更多代码优化和结构的运用。

也有一点私心，希望更多人说 **ng大法好** ，哈哈。

![一起学习angular](https://github.com/DimaLiLongJi/read-angular/blob/master/docs/img/%E4%B8%80%E8%B5%B7%E5%AD%A6%E4%B9%A0angular.png?raw=true)


## 前提

希望看之前读者能先了解一下 typescripy 和 angular 的基础概念，因为文章里会出现大量的 DI，服务商啊这类词

1. [typescript](https://www.tslang.cn/docs/home.html)
2. [angular文档](https://www.angular.cn/docs)

![angular的基础架构](https://www.angular.cn/generated/images/guide/architecture/overview2.png)


## 项目结构

项目下只有三个文件夹：angular docs 和 my-demo

```
- angular: 注释版angular的ts源代码
- docs: 文档位置
- my-demo: 启动的一个demo项目
```

通过 `tsconfig` 把 angular 别名设置到 angular这个文件夹，来阅读下 ts 版本的源码。
