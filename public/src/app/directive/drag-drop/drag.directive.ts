import { Directive, HostListener, ElementRef , Renderer2, Input } from '@angular/core';

@Directive({
  selector: '[app-draggable][dragedClass]', // 使用 <div [app-draggable]='true' [dragedClass]="'className'">
})

export class DragDirective {

  private _isDraggble = false;

  @Input('app-draggable')
  set isDraggable(val: boolean) {
    this._isDraggble = val;
    this.rd.setAttribute(this.el.nativeElement, 'draggable', `${val}`);
  }

  get isDraggable() {
    return this._isDraggble;
  }

  @Input() dragedClass: string;

  constructor(private el: ElementRef, private rd: Renderer2) { }

  @HostListener('dragstart', ['@event'])
  onDragStart(ev: Event) {
    if(this.el.nativeElement === ev.target) {
      this.rd.addClass(this.el.nativeElement, this.dragedClass);
    }
  }

  @HostListener('dragend', ['$event']) // 事件监听
  onDragEnd(ev: Event) { // 对事件进行相应
    if(this.el.nativeElement === ev.target) {
      this.rd.removeClass(this.el.nativeElement, this.dragedClass);
    }
  }

}
