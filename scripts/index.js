
// 背景音乐
const playButton = document.getElementById('play-btn');
const audio = document.getElementById('bg-music');
// 用户交互后播放音乐
playButton.addEventListener('click', () => {
  if (audio.paused) {
    // 音乐处于暂停状态，点击按钮后播放音乐
    audio.play()
        .then(() => {
          playButton.textContent = '暂停音乐';
        })
        .catch(error => {
          console.log('播放失败:', error);
        });
  } else {
    // 音乐正在播放，点击按钮后暂停音乐
    audio.pause();
    playButton.textContent = '播放音乐';
  }
});