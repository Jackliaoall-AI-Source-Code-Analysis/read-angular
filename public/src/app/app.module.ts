import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms'; // 引入依赖放在imports里
import { HttpModule } from '@angular/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'

import { HeroDetailComponent } from './component/hero-detail/hero-detail.component';
import { IndexComponent } from './component/index';

import { HeroService, HeroService2} from './services/hero.service';

import { AppRoutingModule } from './router/index';


@NgModule({  // @NgModule为创建好的module
  declarations: [ // 声明，声明本模块引入的其他数组包就是Component和Directive
    IndexComponent,
    // HeroDetailComponent,
    // BrowserAnimationsModule,
  ],
  imports: [ // 导入其他模块 form 路由啥的
    BrowserModule,
    // FormsModule,
    // AppRoutingModule, // 路由module
    // HttpModule,
  ],
  // providers: [
  //   HeroService,
  //   HeroService2,
  // ], // 服务提供者，主要用来定义服务
  bootstrap: [IndexComponent], // 启动模块。只在根模块使用。在除了根模块以外的其他模块不能使用。
  exports: [ // 导出模块Module,用来提供别的module使用

  ],
})
export class AppModule { }
