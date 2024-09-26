let currentSlideIndex = 0;
const slides = document.querySelector('.slides');
const totalSlides = document.querySelectorAll('.slides img').length;

function updateSlidePosition() {
  // 通过变换来移动幻灯片
  slides.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
}

function nextSlide() {
  if (currentSlideIndex < totalSlides - 1) {
    currentSlideIndex++;
  } else {
    currentSlideIndex = 0;  // 如果是最后一张，重置为第一张
  }
  updateSlidePosition();
}

function prevSlide() {
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
  } else {
    currentSlideIndex = totalSlides - 1;  // 如果是第一张，切换到最后一张
  }
  updateSlidePosition();
}

// 自动切换功能，每 7 秒切换到下一张
setInterval(nextSlide, 7000);


function showSeries(seriesId) {
  // 确定需要隐藏的类（例如 bmw 或 audi）
  var brandPrefix = seriesId.split('-')[0]; // 假设 ID 格式是 'bmw-1' 或 'audi-2'
  var contentClass = '.' + brandPrefix + '-series-content'; // 动态确定类名，如 '.bmw-series-content'

  // 只隐藏对应品牌的系列内容
  var allSeries = document.querySelectorAll(contentClass);
  allSeries.forEach(function(series) {
      series.style.display = 'none';
  });

  // 显示点击的系列内容
  var seriesToShow = document.getElementById(seriesId);
  if (seriesToShow) {
      seriesToShow.style.display = 'block';
  }
}

  