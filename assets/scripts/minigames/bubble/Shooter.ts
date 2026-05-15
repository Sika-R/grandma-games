import { _decorator, Component, Node, Vec3, Vec2, UITransform, Layers, Graphics, Color, EventTouch, EventMouse, input, Input, Camera, view, tween } from 'cc';
import { BubbleConfig } from './BubbleConfig';
import { Bubble } from './Bubble';
import { BubbleColor, randomBubbleColor } from './BubbleType';
import { Grid } from './Grid';
import { BubbleFX } from './BubbleFX';

const { ccclass } = _decorator;

interface ShooterBounds {
    leftX: number;          // 反弹墙：左
    rightX: number;         // 反弹墙：右
    topY: number;           // 飞行上限（兜底，正常应该被 grid 顶或泡泡先拦截）
}

interface ShooterDeps {
    worldRoot: Node;        // 飞行泡泡的父节点
    bounds: ShooterBounds;
    grid: Grid;             // 用于碰撞检测和顶部边界
    onBubbleLand: (b: Bubble, worldPos: Vec3) => void;  // 飞行泡泡需要吸附时回调
    fx?: BubbleFX;          // 可选：传入用于轨迹/枪口火等特效
}

// 发射器 Component。挂在 Shooter 节点上（节点位置 = 发射点）
// 由 BubbleGame.onLoad 调 init() 注入依赖
@ccclass('Shooter')
export class Shooter extends Component {
    private deps: ShooterDeps | null = null;

    private aimGraphics: Graphics | null = null;
    private bodyGraphics: Graphics | null = null;
    private currentBubble: Bubble | null = null;       // 待发射
    private nextColor: BubbleColor = randomBubbleColor();

    private aimDirection: Vec2 = new Vec2(0, 1);
    private flying: Bubble[] = [];

    // "按下→抬起" 守卫：防止没有先按下就触发 fire（避免 Cocos 浏览器预览里
    // 鼠标移动/移出 canvas 等场景误触 TOUCH_END/TOUCH_CANCEL）
    private pressed: boolean = false;

    init(deps: ShooterDeps) {
        this.deps = deps;
        this.spawnNextBubble();
        const wp = this.node.getWorldPosition();
        console.log(`[Shooter] init: worldPos=(${wp.x.toFixed(1)}, ${wp.y.toFixed(1)}), bounds=${JSON.stringify(deps.bounds)}`);
    }

    // 允许 BubbleGame 在 init 之后再注入 fx（fx 节点是在 shooter 之后创建的）
    attachFX(fx: BubbleFX) {
        if (this.deps) this.deps.fx = fx;
    }

    onLoad() {
        // 自身画一个发射器底座
        const bodyNode = new Node('Body');
        bodyNode.layer = Layers.Enum.UI_2D;
        bodyNode.addComponent(UITransform);
        this.node.addChild(bodyNode);
        this.bodyGraphics = bodyNode.addComponent(Graphics);
        const r = BubbleConfig.BUBBLE_RADIUS;
        this.bodyGraphics.fillColor = new Color(200, 200, 220);
        this.bodyGraphics.circle(0, 0, r * 0.9);
        this.bodyGraphics.fill();

        // 瞄准线 Graphics —— 加在 worldRoot 那层（init 后才知道），先放在 shooter 节点上
        const aimNode = new Node('Aim');
        aimNode.layer = Layers.Enum.UI_2D;
        aimNode.addComponent(UITransform);
        this.node.parent?.addChild(aimNode);
        this.aimGraphics = aimNode.addComponent(Graphics);

        // 监听全局触摸/鼠标
        // - TOUCH_START: 标记 pressed=true，开始瞄准
        // - TOUCH_MOVE: 拖拽中持续更新瞄准
        // - TOUCH_END: 只有 pressed 才发射（避免误触）
        // - TOUCH_CANCEL: 取消按下状态，不发射
        // - MOUSE_MOVE: 桌面浏览器悬停瞄准（不点击也能更新瞄准线）
        input.on(Input.EventType.TOUCH_START, this.onPressStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.updateAim, this);
        input.on(Input.EventType.TOUCH_END, this.onPressEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onPressCancel, this);
        input.on(Input.EventType.MOUSE_MOVE, this.updateAim, this);
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onPressStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.updateAim, this);
        input.off(Input.EventType.TOUCH_END, this.onPressEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onPressCancel, this);
        input.off(Input.EventType.MOUSE_MOVE, this.updateAim, this);
    }

    private onPressStart(e: EventTouch) {
        this.pressed = true;
        this.updateAim(e);
    }

    private onPressEnd(e: EventTouch) {
        if (!this.pressed) return;          // 没按下过，忽略（防误触发）
        this.pressed = false;
        this.fire(e);
    }

    private onPressCancel(_e: EventTouch) {
        this.pressed = false;               // 取消，不发射
    }

    private spawnNextBubble() {
        if (!this.deps) return;
        const color = this.nextColor;
        this.nextColor = randomBubbleColor();
        // 待发射泡泡作为 shooter 子节点显示
        const b = Bubble.create(this.node, color, new Vec3(0, 0, 0));
        this.currentBubble = b;
    }

    private updateAim(e: EventTouch | EventMouse) {
        // ⚠️ 关键：getUILocation() 返回 UI 屏幕坐标（原点在屏幕左下角）
        //    但 node.getWorldPosition() 是世界坐标（原点在画布中心）
        //    必须减去 visibleSize/2 把 UI 坐标转成世界坐标，否则瞄准方向永远偏一个角度
        const touch = e.getUILocation();
        const visible = view.getVisibleSize();
        const touchWorldX = touch.x - visible.width / 2;
        const touchWorldY = touch.y - visible.height / 2;

        const shooterPos = this.node.getWorldPosition();
        const dx = touchWorldX - shooterPos.x;
        const dy = touchWorldY - shooterPos.y;

        // 不允许向下/水平射击：触摸点必须在发射器上方
        if (dy <= 1) return;

        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        this.aimDirection.set(dx / len, dy / len);
        this.recomputeAimLine();
    }

    private fire(e: EventTouch) {
        if (!this.currentBubble || !this.deps) return;

        // 同样要做 UI → 世界 坐标转换
        const touch = e.getUILocation();
        const visible = view.getVisibleSize();
        const touchWorldY = touch.y - visible.height / 2;

        const shooterPos = this.node.getWorldPosition();
        if (touchWorldY - shooterPos.y <= 1) return;  // 点击在发射器下方，忽略
        this.updateAim(e);

        const b = this.currentBubble;
        this.currentBubble = null;

        // 把泡泡从 shooter 子节点 reparent 到 worldRoot，世界位置保持
        const worldPos = b.node.getWorldPosition();
        b.node.removeFromParent();
        this.deps.worldRoot.addChild(b.node);
        b.node.setWorldPosition(worldPos);

        const speed = BubbleConfig.SHOOT_SPEED;
        b.velocity = { x: this.aimDirection.x * speed, y: this.aimDirection.y * speed };
        // 记录上次 spawn trail 的位置，用于按距离间隔生成轨迹点
        b.lastTrailPos = b.node.getWorldPosition().clone();
        this.flying.push(b);

        // 清掉瞄准线
        this.aimGraphics?.clear();

        // 反馈：枪口火 + 发射器后坐力
        if (this.deps.fx) {
            const muzzleColor = BubbleConfig.COLOR_PALETTE[b.color];
            this.deps.fx.muzzleFlash(shooterPos, muzzleColor);
        }
        this.recoilSquash();

        // 上膛下一颗
        this.spawnNextBubble();
    }

    // 发射后底座短暂下压再回弹
    private recoilSquash() {
        const orig = new Vec3(1, 1, 1);
        tween(this.node)
            .to(0.06, { scale: new Vec3(1.15, 0.85, 1) }, { easing: 'cubicOut' })
            .to(0.18, { scale: orig }, { easing: 'elasticOut' })
            .start();
    }

    update(dt: number) {
        if (!this.deps) return;
        const bounds = this.deps.bounds;
        const grid = this.deps.grid;
        const fx = this.deps.fx;
        const r = BubbleConfig.BUBBLE_RADIUS;
        // 碰撞距离：球心到球心 = 直径 (2r)。连续碰撞 (CCD) 下不需要 buffer
        const collideR = 2 * r;
        const collideR2 = collideR * collideR;
        const gridTopY = grid.getTopWorldY();
        // 缓存所有网格泡泡的世界坐标
        const gridBubbles = grid.getAllBubbles();
        // 飞行轨迹：每移动 trailGapPx 像素 spawn 一个尾迹点
        const trailGapPx = r * 0.7;
        const trailGap2 = trailGapPx * trailGapPx;

        for (let i = this.flying.length - 1; i >= 0; i--) {
            const b = this.flying[i];
            if (!b.velocity) {
                this.flying.splice(i, 1);
                continue;
            }
            const startX = b.node.position.x;
            const startY = b.node.position.y;
            let endX = startX + b.velocity.x * dt;
            let endY = startY + b.velocity.y * dt;

            // 左右墙反弹（先做：反弹后的段才是 CCD 真正要扫的段）
            if (endX < bounds.leftX + r) {
                endX = bounds.leftX + r;
                b.velocity.x = Math.abs(b.velocity.x);
            } else if (endX > bounds.rightX - r) {
                endX = bounds.rightX - r;
                b.velocity.x = -Math.abs(b.velocity.x);
            }

            // ===== 连续碰撞检测 (CCD) =====
            // 在 [start, end] 段上找最早的"落地"事件（t ∈ [0, 1]）
            // 1) 与天花板 gridTopY 的交点
            // 2) 与每颗网格泡泡的段-圆首次相交点（解二次方程取较小正根）
            // 取 t 最小的作为落点 → 防止穿过球到上层空白
            const dx = endX - startX;
            const dy = endY - startY;
            let bestT = Infinity;
            let landX = 0;
            let landY = 0;

            // 1) 天花板
            if (endY >= gridTopY) {
                const tCeil = dy > 0 ? Math.max(0, (gridTopY - startY) / dy) : 0;
                if (tCeil < bestT) {
                    bestT = tCeil;
                    landX = startX + dx * tCeil;
                    landY = gridTopY;
                }
            }

            // 2) 段-圆首次相交：|P(t) - C|² = R²
            //    P(t) = start + t·d，展开为 a·t² + b·t + c = 0
            const a = dx * dx + dy * dy;
            if (a > 0) {
                for (const gb of gridBubbles) {
                    const gp = gb.node.getWorldPosition();
                    const fxv = startX - gp.x;
                    const fyv = startY - gp.y;
                    const bb = 2 * (fxv * dx + fyv * dy);
                    const cc = fxv * fxv + fyv * fyv - collideR2;
                    const disc = bb * bb - 4 * a * cc;
                    if (disc < 0) continue;
                    const sqrtD = Math.sqrt(disc);
                    let tEnter = (-bb - sqrtD) / (2 * a);
                    if (tEnter < 0) tEnter = 0;       // 起点已在圆内（极端情况）
                    if (tEnter > 1) continue;          // 此段内未碰到
                    if (tEnter < bestT) {
                        bestT = tEnter;
                        landX = startX + dx * tEnter;
                        landY = startY + dy * tEnter;
                    }
                }
            }

            if (bestT !== Infinity) {
                // 用真实碰撞点上报，而不是这一帧的终点。
                // findNearestEmptyCell 用这个点找最近空格 → 不会跨过障碍球吸附到上层
                this.deps.onBubbleLand(b, new Vec3(landX, landY, 0));
                this.flying.splice(i, 1);
                continue;
            }

            // 兜底：飞过屏幕顶（理论上 gridTopY 已先触发）
            if (endY > bounds.topY) {
                b.node.destroy();
                this.flying.splice(i, 1);
                continue;
            }

            b.node.setPosition(endX, endY, 0);

            // 飞行轨迹：按距离间隔 spawn
            if (fx && b.lastTrailPos) {
                const curWorld = b.node.getWorldPosition();
                const tdx = curWorld.x - b.lastTrailPos.x;
                const tdy = curWorld.y - b.lastTrailPos.y;
                if (tdx * tdx + tdy * tdy >= trailGap2) {
                    fx.spawnTrailDot(curWorld, BubbleConfig.COLOR_PALETTE[b.color], r * 0.45);
                    b.lastTrailPos = curWorld.clone();
                }
            }
        }
    }

    private recomputeAimLine() {
        if (!this.aimGraphics || !this.deps) return;
        const g = this.aimGraphics;
        g.clear();
        g.lineWidth = 3;
        g.strokeColor = new Color(255, 255, 255, 180);

        const bounds = this.deps.bounds;
        const r = BubbleConfig.BUBBLE_RADIUS;
        const start = this.node.getWorldPosition();   // UI 空间
        let x = start.x;
        let y = start.y;
        let dx = this.aimDirection.x;
        let dy = this.aimDirection.y;

        const points: Vec2[] = [new Vec2(x, y)];
        for (let bounce = 0; bounce <= BubbleConfig.AIM_MAX_REFLECTIONS; bounce++) {
            // 求与左/右墙、顶部的最近交点
            const leftLimit = bounds.leftX + r;
            const rightLimit = bounds.rightX - r;
            const topLimit = bounds.topY;

            let tWall = Infinity;
            let hitWall: 'left' | 'right' | 'top' | null = null;

            if (dx < 0) {
                const t = (leftLimit - x) / dx;
                if (t > 0 && t < tWall) { tWall = t; hitWall = 'left'; }
            } else if (dx > 0) {
                const t = (rightLimit - x) / dx;
                if (t > 0 && t < tWall) { tWall = t; hitWall = 'right'; }
            }
            if (dy > 0) {
                const t = (topLimit - y) / dy;
                if (t > 0 && t < tWall) { tWall = t; hitWall = 'top'; }
            }

            if (!hitWall || !isFinite(tWall)) break;

            x += dx * tWall;
            y += dy * tWall;
            points.push(new Vec2(x, y));

            if (hitWall === 'top') break;
            // 反弹
            dx = -dx;
        }

        // 画虚线
        const dash = BubbleConfig.AIM_DASH_LEN;
        const gap = BubbleConfig.AIM_GAP_LEN;
        for (let i = 0; i < points.length - 1; i++) {
            this.drawDashedLine(g, points[i], points[i + 1], dash, gap);
        }
        g.stroke();
    }

    private drawDashedLine(g: Graphics, a: Vec2, b: Vec2, dash: number, gap: number) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len;
        const uy = dy / len;
        let drawn = 0;
        while (drawn < len) {
            const segEnd = Math.min(drawn + dash, len);
            g.moveTo(a.x + ux * drawn, a.y + uy * drawn);
            g.lineTo(a.x + ux * segEnd, a.y + uy * segEnd);
            drawn = segEnd + gap;
        }
    }
}
