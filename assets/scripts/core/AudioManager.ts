// 音频管理器 stub —— 接口先留好，等有 BGM/SFX 资源再填实现
class AudioManagerImpl {
    playBgm(_name: string) {
        // TODO: 加载并循环播放 BGM
    }

    stopBgm() {
        // TODO
    }

    playSfx(_name: string) {
        // TODO: 一次性音效
    }

    setBgmVolume(_v: number) {
        // TODO
    }

    setSfxVolume(_v: number) {
        // TODO
    }
}

export const AudioManager = new AudioManagerImpl();
