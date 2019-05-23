import { Component, Input } from '@angular/core';
import { Hero } from '../hero';
import { Router } from '@angular/router';


@Component({
  selector: 'hero-detail', // 标签标示
  templateUrl: './template.html',
  //   template: `
  //   <h1>{{title}}</h1>
  //   <nav>
  //   // routerLink routerLinkActive
  //     <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
  //     <a routerLink="/heroes" routerLinkActive="active">Heroes</a>
  //   </nav>
  //   <router-outlet></router-outlet>
  // `,
})

export class HeroDetailComponent {
  @Input('hero') hero: Hero | undefined;
  constructor(
    private router: Router, ) {
      console.log(this.hero);
    }

}
