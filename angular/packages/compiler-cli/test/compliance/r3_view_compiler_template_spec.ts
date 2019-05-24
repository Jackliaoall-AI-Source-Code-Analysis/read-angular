/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {AttributeMarker} from '@angular/compiler/src/core';
import {setup} from '@angular/compiler/test/aot/test_util';
import {compile, expectEmit} from './mock_compile';

describe('compiler compliance: template', () => {
  const angularFiles = setup({
    compileAngular: false,
    compileFakeCore: true,
    compileAnimations: false,
  });

  it('should correctly bind to context in nested template', () => {
    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`
                  <ul *ngFor="let outer of items">
                    <li *ngFor="let middle of outer.items">
                      <div *ngFor="let inner of items"
                           (click)="onClick(outer, middle, inner)"
                           [title]="format(outer, middle, inner, component)"
                           >
                        {{format(outer, middle, inner, component)}}
                      </div>
                    </li>
                  </ul>\`
              })
              export class MyComponent {
                component = this;
                format(outer: any, middle: any, inner: any) { }
                onClick(outer: any, middle: any, inner: any) { }
              }

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    // The template should look like this (where IDENT is a wild card for an identifier):
    const template = `
      const $c0$ = [${AttributeMarker.Template}, "ngFor", "ngForOf"];
      const $c1$ = [${AttributeMarker.Bindings}, "title", "click", ${AttributeMarker.Template}, "ngFor", "ngForOf"];
      const $c2$ = [${AttributeMarker.Bindings}, "title", "click"];
      function MyComponent_ul_0_li_1_div_1_Template(rf, ctx) {

        if (rf & 1) {
          const $s$ = $i0$.ɵɵgetCurrentView();
          $i0$.ɵɵelementStart(0, "div", $c2$);
          $i0$.ɵɵlistener("click", function MyComponent_ul_0_li_1_div_1_Template_div_click_0_listener($event){
            $i0$.ɵɵrestoreView($s$);
            const $inner$ = ctx.$implicit;
            const $middle$ = $i0$.ɵɵnextContext().$implicit;
            const $outer$ = $i0$.ɵɵnextContext().$implicit;
            const $myComp$ = $i0$.ɵɵnextContext();
            return $myComp$.onClick($outer$, $middle$, $inner$);
          });
          $i0$.ɵɵtext(1);
          $i0$.ɵɵelementEnd();
        }

        if (rf & 2) {
          const $inner1$ = ctx.$implicit;
          const $middle1$ = $i0$.ɵɵnextContext().$implicit;
          const $outer1$ = $i0$.ɵɵnextContext().$implicit;
          const $myComp1$ = $i0$.ɵɵnextContext();
          $i0$.ɵɵselect(0);
          $i0$.ɵɵproperty("title", $myComp1$.format($outer1$, $middle1$, $inner1$, $myComp1$.component));
          $r3$.ɵɵselect(1);
          $i0$.ɵɵtextBinding(1, $i0$.ɵɵinterpolation1(" ", $myComp1$.format($outer1$, $middle1$, $inner1$, $myComp1$.component), " "));
        }
      }

      function MyComponent_ul_0_li_1_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "li");
          $i0$.ɵɵtemplate(1, MyComponent_ul_0_li_1_div_1_Template, 2, 2, "div", $c1$);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $myComp2$ = $i0$.ɵɵnextContext(2);
          $r3$.ɵɵselect(1);
          $i0$.ɵɵproperty("ngForOf", $myComp2$.items);
        }
      }

      function MyComponent_ul_0_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "ul");
          $i0$.ɵɵtemplate(1, MyComponent_ul_0_li_1_Template, 2, 1, "li", $c0$);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $outer2$ = ctx.$implicit;
          $r3$.ɵɵselect(1);
          $i0$.ɵɵproperty("ngForOf", $outer2$.items);
        }
      }
      // ...
      template:function MyComponent_Template(rf, ctx){
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_ul_0_Template, 2, 1, "ul", $c0$);
        }
        if (rf & 2) {
          $i0$.ɵɵselect(0);
          $i0$.ɵɵproperty("ngForOf", ctx.items);
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });

  it('should correctly bind to context in nested template with many bindings', () => {
    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`
                  <div *ngFor="let d of _data; let i = index" (click)="_handleClick(d, i)"></div>
                \`
              })
              export class MyComponent {
                _data = [1,2,3];
                _handleClick(d: any, i: any) {}
              }

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    const template = `
        const $t0_attrs$ = [${AttributeMarker.Bindings}, "click", ${AttributeMarker.Template}, "ngFor", "ngForOf"];
        const $e_attrs$ = [${AttributeMarker.Bindings}, "click"];

        function MyComponent_div_0_Template(rf, ctx) {
          if (rf & 1) {
            const $s$ = $r3$.ɵɵgetCurrentView();
            $r3$.ɵɵelementStart(0, "div", $e_attrs$);
            $r3$.ɵɵlistener("click", function MyComponent_div_0_Template_div_click_0_listener($event) {
              $r3$.ɵɵrestoreView($s$);
              const $d$ = ctx.$implicit;
              const $i$ = ctx.index;
              const $comp$ = $r3$.ɵɵnextContext();
              return $comp$._handleClick($d$, $i$);
            });
            $r3$.ɵɵelementEnd();
          }
        }
        // ...
        template: function MyComponent_Template(rf, ctx) {
          if (rf & 1) {
            $r3$.ɵɵtemplate(0, MyComponent_div_0_Template, 1, 0, "div", $t0_attrs$);
          }
          if (rf & 2) {
            $r3$.ɵɵselect(0);
            $r3$.ɵɵproperty("ngForOf", ctx._data);
          }
        }
        `;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });

  it('should support ngFor context variables', () => {
    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`
                    <span *ngFor="let item of items; index as i">
                      {{ i }} - {{ item }}
                    </span>\`
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    const template = `
      const $c0$ = [${AttributeMarker.Template}, "ngFor", "ngForOf"];

      function MyComponent_span_0_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "span");
          $i0$.ɵɵtext(1);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $item$ = ctx.$implicit;
          const $i$ = ctx.index;
          $r3$.ɵɵselect(1);
          $i0$.ɵɵtextBinding(1, $i0$.ɵɵinterpolation2(" ", $i$, " - ", $item$, " "));
        }
      }
      // ...
      template:function MyComponent_Template(rf, ctx){
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_span_0_Template, 2, 2, "span", _c0);
        }
        if (rf & 2) {
          $i0$.ɵɵselect(0);
          $i0$.ɵɵproperty("ngForOf", ctx.items);
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });

  it('should support ngFor context variables in parent views', () => {
    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`
                  <div *ngFor="let item of items; index as i">
                      <span *ngIf="showing">
                        {{ i }} - {{ item }}
                      </span>
                  </div>\`
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    const template = `
      const $c0$ = [${AttributeMarker.Template}, "ngFor", "ngForOf"];
      const $c1$ = [${AttributeMarker.Template}, "ngIf"];

      function MyComponent_div_0_span_1_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "span");
          $i0$.ɵɵtext(1);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $div$ = $i0$.ɵɵnextContext();
          const $i$ = $div$.index;
          const $item$ = $div$.$implicit;
          $r3$.ɵɵselect(1);
          $i0$.ɵɵtextBinding(1, $i0$.ɵɵinterpolation2(" ", $i$, " - ", $item$, " "));
        }
      }

      function MyComponent_div_0_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "div");
          $i0$.ɵɵtemplate(1, MyComponent_div_0_span_1_Template, 2, 2, "span", $c1$);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $app$ = $i0$.ɵɵnextContext();
          $r3$.ɵɵselect(1);
          $i0$.ɵɵproperty("ngIf", $app$.showing);
        }
      }

      // ...
      template:function MyComponent_Template(rf, ctx){
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_div_0_Template, 2, 1, "div", $c0$);
        }
        if (rf & 2) {
          $i0$.ɵɵselect(0);
          $i0$.ɵɵproperty("ngForOf", ctx.items);
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });

  it('should correctly skip contexts as needed', () => {
    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`
                  <div *ngFor="let outer of items">
                    <div *ngFor="let middle of outer.items">
                      <div *ngFor="let inner of middle.items">
                        {{ middle.value }} - {{ name }}
                      </div>
                    </div>
                  </div>\`
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    // The template should look like this (where IDENT is a wild card for an identifier):
    const template = `
      const $c0$ = [${AttributeMarker.Template}, "ngFor", "ngForOf"];
      function MyComponent_div_0_div_1_div_1_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "div");
          $i0$.ɵɵtext(1);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $middle$ = $i0$.ɵɵnextContext().$implicit;
          const $myComp$ = $i0$.ɵɵnextContext(2);
          $r3$.ɵɵselect(1);
          $i0$.ɵɵtextBinding(1, $i0$.ɵɵinterpolation2(" ", $middle$.value, " - ", $myComp$.name, " "));
        }
      }

      function MyComponent_div_0_div_1_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "div");
          $i0$.ɵɵtemplate(1, MyComponent_div_0_div_1_div_1_Template, 2, 2, "div", $c0$);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $middle$ = ctx.$implicit;
          $r3$.ɵɵselect(1);
          $i0$.ɵɵproperty("ngForOf", $middle$.items);
        }
      }

      function MyComponent_div_0_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelementStart(0, "div");
          $i0$.ɵɵtemplate(1, MyComponent_div_0_div_1_Template, 2, 1, "div", $c0$);
          $i0$.ɵɵelementEnd();
        }
        if (rf & 2) {
          const $outer$ = ctx.$implicit;
          $r3$.ɵɵselect(1);
          $i0$.ɵɵproperty("ngForOf", $outer$.items);
        }
      }
      // ...
      template:function MyComponent_Template(rf, ctx){
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_div_0_Template, 2, 1, "div", $c0$);
        }
        if (rf & 2) {
          $i0$.ɵɵselect(0);
          $i0$.ɵɵproperty("ngForOf", ctx.items);
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });

  it('should support <ng-template>', () => {
    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`
                  <ng-template [boundAttr]="b" attr="l">
                    some-content
                  </ng-template>\`
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    const template = `
      const $c0$ = ["attr", "l", ${AttributeMarker.Bindings}, "boundAttr"];

      function MyComponent_ng_template_0_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵtext(0, " some-content ");
        }
      }

      // ...

      template: function MyComponent_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_ng_template_0_Template, 1, 0, "ng-template", $c0$);
        }
        if (rf & 2) {
          $i0$.ɵɵselect(0);
          $i0$.ɵɵproperty("boundAttr", ctx.b);
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });

  it('should support local refs on <ng-template>', () => {

    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: '<ng-template #foo>some-content</ng-template>',
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    const template = `
      const $t0_refs$ = ["foo", ""];

      function MyComponent_ng_template_0_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵtext(0, "some-content");
        }
      }

      // ...

      template: function MyComponent_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_ng_template_0_Template, 1, 0, "ng-template", null, $t0_refs$, $i0$.ɵɵtemplateRefExtractor);
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });

  it('should support directive outputs on <ng-template>', () => {

    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: '<ng-template (outDirective)="$event.doSth()"></ng-template>',
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    const template = `
      const $t0_attrs$ = [${AttributeMarker.Bindings}, "outDirective"];

      function MyComponent_ng_template_0_Template(rf, ctx) { }

      // ...

      template: function MyComponent_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_ng_template_0_Template, 0, 0, "ng-template", $t0_attrs$);
          $i0$.ɵɵlistener("outDirective", function MyComponent_Template_ng_template_outDirective_0_listener($event) { return $event.doSth(); });
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');

  });

  it('should create unique template function names even for similar nested template structures',
     () => {
       const files = {
         app: {
           'spec1.ts': `
          import {Component, NgModule} from '@angular/core';

          @Component({
            selector: 'a-component',
            template: \`
              <div *ngFor="let item of items">
                <p *ngIf="item < 10">less than 10</p>
                <p *ngIf="item < 10">less than 10</p>
              </div>
              <div *ngFor="let item of items">
                <p *ngIf="item > 10">more than 10</p>
              </div>
            \`,
          })
          export class AComponent {
            items = [4, 2];
          }

          @NgModule({declarations: [AComponent]})
          export class AModule {}
        `,
           'spec2.ts': `
          import {Component, NgModule} from '@angular/core';

          @Component({
            selector: 'b-component',
            template: \`
              <div *ngFor="let item of items">
                <ng-container *ngFor="let subitem of item.subitems">
                  <p *ngIf="subitem < 10">less than 10</p>
                  <p *ngIf="subitem < 10">less than 10</p>
                </ng-container>
                <ng-container *ngFor="let subitem of item.subitems">
                  <p *ngIf="subitem < 10">less than 10</p>
                </ng-container>
              </div>
              <div *ngFor="let item of items">
                <ng-container *ngFor="let subitem of item.subitems">
                  <p *ngIf="subitem > 10">more than 10</p>
                </ng-container>
              </div>
            \`,
          })
          export class BComponent {
            items = [
              {subitems: [1, 3]},
              {subitems: [3, 7]},
            ];
          }

          @NgModule({declarations: [BComponent]})
          export class BModule {}
        `,
         },
       };

       const result = compile(files, angularFiles);

       const allTemplateFunctionsNames = (result.source.match(/function ([^\s(]+)/g) || [])
                                             .map(x => x.slice(9))
                                             .filter(x => x.includes('Template'))
                                             .sort();
       const uniqueTemplateFunctionNames = Array.from(new Set(allTemplateFunctionsNames));

       // Expected template function:
       // - 5 for AComponent's template.
       // - 9 for BComponent's template.
       // - 2 for the two components.
       expect(allTemplateFunctionsNames.length).toBe(5 + 9 + 2);
       expect(allTemplateFunctionsNames).toEqual(uniqueTemplateFunctionNames);
     });

  it('should create unique template function names for ng-content templates', () => {
    const files = {
      app: {
        'spec.ts': `
          import {Component, NgModule} from '@angular/core';

          @Component({
            selector: 'a-component',
            template: \`
              <ng-content *ngIf="show"></ng-content>
            \`,
          })
          export class AComponent {
            show = true;
          }

          @Component({
            selector: 'b-component',
            template: \`
              <ng-content *ngIf="show"></ng-content>
            \`,
          })
          export class BComponent {
            show = true;
          }

          @NgModule({declarations: [AComponent, BComponent]})
          export class AModule {}
        `
      },
    };

    const result = compile(files, angularFiles);

    const allTemplateFunctionsNames = (result.source.match(/function ([^\s(]+)/g) || [])
                                          .map(x => x.slice(9))
                                          .filter(x => x.includes('Template'))
                                          .sort();
    const uniqueTemplateFunctionNames = Array.from(new Set(allTemplateFunctionsNames));

    // Expected template function:
    // - 1 for AComponent's template.
    // - 1 for BComponent's template.
    // - 2 for the two components.
    expect(allTemplateFunctionsNames.length).toBe(1 + 1 + 2);
    expect(allTemplateFunctionsNames).toEqual(uniqueTemplateFunctionNames);
  });

  it('should create unique listener function names even for similar nested template structures',
     () => {
       const files = {
         app: {
           'spec.ts': `
          import {Component, NgModule} from '@angular/core';

          @Component({
            selector: 'my-component',
            template: \`
              <div *ngFor="let item of items">
                <p (click)="$event">{{ item }}</p>
                <p (click)="$event">{{ item }}</p>
              </div>
              <div *ngFor="let item of items">
                <p (click)="$event">{{ item }}</p>
              </div>
            \`,
          })
          export class MyComponent {
            items = [4, 2];
          }

          @NgModule({declarations: [MyComponent]})
          export class MyModule {}
        `,
         },
       };

       const result = compile(files, angularFiles);

       const allListenerFunctionsNames = (result.source.match(/function ([^\s(]+)/g) || [])
                                             .map(x => x.slice(9))
                                             .filter(x => x.includes('listener'))
                                             .sort();
       const uniqueListenerFunctionNames = Array.from(new Set(allListenerFunctionsNames));

       expect(allListenerFunctionsNames.length).toBe(3);
       expect(allListenerFunctionsNames).toEqual(uniqueListenerFunctionNames);
     });

  it('should support pipes in template bindings', () => {
    const files = {
      app: {
        'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`
                  <div *ngIf="val | pipe"></div>\`
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
      }
    };

    const template = `
      const $c0$ = [${AttributeMarker.Template}, "ngIf"];

      function MyComponent_div_0_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵelement(0, "div");
        }
      }

      // ...

      template: function MyComponent_Template(rf, ctx) {
        if (rf & 1) {
          $i0$.ɵɵtemplate(0, MyComponent_div_0_Template, 1, 0, "div", $c0$);
          $i0$.ɵɵpipe(1, "pipe");
        } if (rf & 2) {
          $i0$.ɵɵselect(0);
          $i0$.ɵɵproperty("ngIf", $i0$.ɵɵpipeBind1(1, 1, ctx.val));
        }
      }`;

    const result = compile(files, angularFiles);

    expectEmit(result.source, template, 'Incorrect template');
  });
});