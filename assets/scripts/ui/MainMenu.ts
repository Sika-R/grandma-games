import { _decorator, Component, Node, Label, Color, UITransform, Canvas, Camera, view, director, Layers, Vec3, EventTouch, Sprite, SpriteFrame, ImageAsset, Texture2D, Graphics } from 'cc';
import { SaveManager } from '../core/SaveManager';
import { EventBus, Events } from '../core/EventBus';
import { SceneName } from '../data/Config';

const { ccclass } = _decorator;

// 主菜单场景 Bootstrap
// 在 Cocos 编辑器里：MainScene 根节点挂一个空节点 "Bootstrap"，挂上本组件即可
// 所有 UI 由本组件在 onLoad 里动态创建
@ccclass('MainMenu')
export class MainMenu extends Component {
    private coinsLabel: Label | null = null;

    onLoad() {
        // 触发存档加载
        const save = SaveManager.load();

        this.buildUI();
        this.refreshCoins(save.currency.coins);

        EventBus.on(Events.COINS_CHANGED, this.refreshCoins, this);
    }

    onDestroy() {
        EventBus.off(Events.COINS_CHANGED, this.refreshCoins);
    }

    private buildUI() {
        const root = this.node;

        // 确保根节点有 UITransform 和合适的 layer
        ensureUITransform(root);
        const visible = view.getVisibleSize();
        root.getComponent(UITransform)!.setContentSize(visible);

        // === Camera + Canvas ===
        // 如果场景没有 Canvas，自动建一个；否则就用现有的
        let canvas = this.node.getComponent(Canvas);
        if (!canvas) {
            const canvasNode = ensureCanvas(root);
            canvas = canvasNode.getComponent(Canvas)!;
        }
        const canvasNode = canvas.node;

        // === 标题 ===
        const titleNode = createLabelNode('怀旧小游戏', 64, new Color(255, 255, 255));
        titleNode.setPosition(new Vec3(0, visible.height * 0.3, 0));
        canvasNode.addChild(titleNode);

        // === 金币显示 ===
        const coinsNode = createLabelNode('金币: 0', 36, new Color(255, 215, 0));
        coinsNode.setPosition(new Vec3(0, visible.height * 0.15, 0));
        canvasNode.addChild(coinsNode);
        this.coinsLabel = coinsNode.getComponent(Label);

        // === 开始泡泡龙按钮（自绘） ===
        const btn = createButton('开始泡泡龙', 320, 100, () => {
            director.loadScene(SceneName.BUBBLE);
        });
        btn.setPosition(new Vec3(0, -visible.height * 0.1, 0));
        canvasNode.addChild(btn);

        // === 调试按钮：清空存档（DEBUG 时显示）===
        const resetBtn = createButton('清空存档', 200, 60, () => {
            SaveManager.reset();
            SaveManager.load();
            this.refreshCoins(0);
        }, new Color(120, 80, 80));
        resetBtn.setPosition(new Vec3(0, -visible.height * 0.3, 0));
        canvasNode.addChild(resetBtn);
    }

    private refreshCoins(coins: number) {
        if (this.coinsLabel) this.coinsLabel.string = `金币: ${coins}`;
    }
}

// =====================================================
// 共享 UI 工具函数（先放这里，多 UI 文件用了再抽到 ui/UIHelpers.ts）
// =====================================================

export function ensureUITransform(node: Node): UITransform {
    return node.getComponent(UITransform) ?? node.addComponent(UITransform);
}

export function ensureCanvas(parent: Node): Node {
    // 找已有 Canvas
    for (const c of parent.children) {
        if (c.getComponent(Canvas)) return c;
    }
    const visible = view.getVisibleSize();

    // 创建 UI 相机
    // ⚠️ 关键：必须设正交投影 + orthoHeight=可见高度/2，否则相机视野默认很小，
    // 屏幕中心以外的内容（特别是非 design resolution 屏幕上）会被截掉
    const camNode = new Node('Camera');
    camNode.layer = Layers.Enum.UI_2D;
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = visible.height / 2;
    cam.near = 1;
    cam.far = 2000;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor.set(30, 30, 50, 255);
    cam.priority = 1073741824;
    cam.visibility = Layers.Enum.UI_2D;
    camNode.setPosition(0, 0, 1000);
    parent.addChild(camNode);

    // 创建 Canvas
    const canvasNode = new Node('Canvas');
    canvasNode.layer = Layers.Enum.UI_2D;
    const canvas = canvasNode.addComponent(Canvas);
    canvas.cameraComponent = cam;
    ensureUITransform(canvasNode);
    parent.addChild(canvasNode);
    return canvasNode;
}

export function createLabelNode(text: string, fontSize: number, color: Color): Node {
    const n = new Node('Label');
    n.layer = Layers.Enum.UI_2D;
    ensureUITransform(n);
    const lbl = n.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = fontSize;
    lbl.lineHeight = fontSize * 1.2;
    lbl.color = color;
    return n;
}

// 自绘按钮：背景圆角矩形 + Label + 触摸事件
export function createButton(
    text: string,
    width: number,
    height: number,
    onClick: () => void,
    bgColor: Color = new Color(80, 140, 220)
): Node {
    const root = new Node('Button');
    root.layer = Layers.Enum.UI_2D;
    const ui = ensureUITransform(root);
    ui.setContentSize(width, height);

    // 背景
    const bgNode = new Node('BG');
    bgNode.layer = Layers.Enum.UI_2D;
    ensureUITransform(bgNode).setContentSize(width, height);
    const g = bgNode.addComponent(Graphics);
    g.fillColor = bgColor;
    g.roundRect(-width / 2, -height / 2, width, height, 16);
    g.fill();
    root.addChild(bgNode);

    // 文字
    const lblNode = createLabelNode(text, Math.floor(height * 0.4), new Color(255, 255, 255));
    root.addChild(lblNode);

    // 触摸事件
    root.on(Node.EventType.TOUCH_END, (_e: EventTouch) => {
        onClick();
    });

    return root;
}
