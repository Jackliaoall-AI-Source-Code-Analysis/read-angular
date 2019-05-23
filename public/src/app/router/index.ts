import { NgModule }             from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { IndexComponent } from '../component/index';

const routes: Routes = [ // routes一定要是一个array，里面包object
  { path: 'heroes', component: IndexComponent },
  // { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
];

@NgModule({
  imports: [ // 导入其他模块
    RouterModule.forRoot(routes),
  ],
  exports: [
   RouterModule // 对外暴露一个module
 ],
})
export class AppRoutingModule {} // 暴露出去给根元素NgModule
