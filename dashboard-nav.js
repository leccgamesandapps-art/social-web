// Point bottom/sidebar Chat to /chat page
(function () {
  document.querySelectorAll('a[href="#spaces"], a[data-view="spaces"]').forEach(function (a) {
    a.setAttribute('href', '/chat');
    a.removeAttribute('data-view');
    var label = a.querySelector('span:last-child');
    if (label && /spaces/i.test(label.textContent)) label.textContent = 'Chat';
    a.onclick = function (e) {
      e.preventDefault();
      window.location.href = '/chat';
    };
  });
  document.body.classList.add('dashboard-water');
})();
