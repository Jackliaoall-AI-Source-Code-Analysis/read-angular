import { Injectable } from '@angular/core';
import { Hero } from '../component/hero';
import { HEROS } from '../mock-heros';

@Injectable() // 如果需要往里面注入一些依赖就需要了



export class HeroService {
  getHeroes(): Promise<Hero[]> {
    return Promise.resolve(HEROS);
  }
}
export class HeroService2 {
  logTest(): Promise<Hero[]> {
    return Promise.resolve(HEROS);
  }
}
// export const HeroService = {
//     getHeroes(): Promise<Hero[]> {
//       return Promise.resolve(HEROS);
//     };
// }
// 
// 总结：
// 1.export class Service {}
// 2.在使用的地方
//   @Component({
//     providers: []
//   })
//   注入service
// 3.在使用的地方
//   export class component {
//     constructor(private service: Service) {};
//     然后 this.service使用
//   }
