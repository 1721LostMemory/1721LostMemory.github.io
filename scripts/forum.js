document.addEventListener('DOMContentLoaded', function() {
  loadComments();
});

function loadComments() {
  const comments = JSON.parse(localStorage.getItem('comments')) || [];
  const commentList = document.getElementById('commentList');
  commentList.innerHTML = '';
  comments.forEach((comment, index) => {
    const li = document.createElement('li');
    li.classList.add('comment-item');
    const commentTime = new Date(comment.time);
    const formattedTime = isNaN(commentTime.getTime()) ?
        '时间无效' :
        commentTime.toLocaleString();
    li.innerHTML = `
                    ${comment.text}
                    <div class="comment-time">${formattedTime}</div>
                    <button class="like-button ${
        comment.liked ? 'liked' : ''}" onclick="toggleLike(${index})">
                        <i class="fa${comment.liked ? 's' : 'r'} fa-heart"></i>
                        <span class="like-count">${comment.likes}</span>
                    </button>
                    <button class="delete-button" onclick="deleteComment(${
        index})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
    commentList.appendChild(li);
  });
}

function addComment() {
  const commentInput = document.getElementById('commentInput');
  const commentText = commentInput.value.trim();

  if (commentText) {
    const comments = JSON.parse(localStorage.getItem('comments')) || [];
    comments.push({
      text: commentText,
      time: new Date().toISOString(),
      likes: 0,
      liked: false
    });
    localStorage.setItem('comments', JSON.stringify(comments));
    commentInput.value = '';
    loadComments();
  }
}

function toggleLike(index) {
  const comments = JSON.parse(localStorage.getItem('comments')) || [];
  const comment = comments[index];
  if (comment.liked) {
    comment.likes -= 1;
  } else {
    comment.likes += 1;
  }
  comment.liked = !comment.liked;
  localStorage.setItem('comments', JSON.stringify(comments));
  loadComments();
}

function deleteComment(index) {
  let comments = JSON.parse(localStorage.getItem('comments')) || [];
  comments.splice(index, 1);
  localStorage.setItem('comments', JSON.stringify(comments));
  loadComments();
}
