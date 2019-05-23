import { Component, OnInit } from '@angular/core';
// import { HeroService, HeroService2 } from '../services/hero.service';
// import { Location } from '@angular/common';
// import { ActivatedRoute, ParamMap } from '@angular/router';
// import { trigger, state, transition, style } from '@angular/animations';

// import { Hero } from './hero';


@Component({ // 此项为引用的组件，需要在@Component()中传入一个对象，有selector、templateUrl、styleUrls
  selector: 'app-root',  // 标签标示
  templateUrl: './index.html',
  // styleUrls: ['./style.css'],
  // providers: [ // 服务提供者，主要用来定义服务
  //   HeroService,
  //   HeroService2,
  // ],
  // animations: [
  //   trigger('square', [
  //     state('green', style({'background-color': 'green'}))
  //   ])
  // ],
})

export class IndexComponent implements OnInit { // 此项为导出的方法等 给双向绑定用 {;;} implements OnInit 通过ngOnInit()调用
  // HeroService = new HeroService(); // 实例化class HeroService,用来使用方法 不要new他
  title = 'Tour of Heroes';
  // heros: Hero[];
  // selectedHero: Hero;

  constructor(
    // private heroService: HeroService,
    // private heroService2: HeroService2,
    // private route: ActivatedRoute,
    // private location: Location,
  ) { // 实例化AppComponent时会把HeroService传入并new HeroService
    // console.log('HeroService', this.heroService);
  };

  // onSelect = (hero: Hero): void => {
  //   this.selectedHero = hero; // 如果想引用export class AppComponent实例化的方法，需要访问this
  // };
  // getHeroes(): void {
  //   this.heroService.getHeroes().then(heros => this.heros = heros);
  // };
  ngOnInit(): void {
    // this.getHeroes();
    // this.heroService2.logTest().then(i => console.log(i));
    // this.route.paramMap
    //   .switchMap((params: ParamMap) => this.heroService.getHero(+params.get('id')))
    //   .subscribe(hero => this.hero = hero);
  };
  // getHeroes(): void { // 这是export HeroService对象
  //   HeroService.getHeroes().then(heros => this.heros = heros);
  // }

}
