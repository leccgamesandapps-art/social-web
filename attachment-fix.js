// Featured link detection + file attachments for Create Post
(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;

  var me = DB.getSession().username;
  var pendingFiles = [];
  var pendingLink = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function detectUrls(text) {
    var re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    return (String(text || '').match(re) || []);
  }
  function buildLinkMeta(url) {
    try {
      var u = new URL(url);
      var host = u.hostname.replace(/^www\./, '');
      var hash = u.hash || '';
      var sm = hash.match(/#share=([^&]+)/i);
      if (sm && typeof DB !== 'undefined' && DB.getShareDisplay) {
        var code = decodeURIComponent(sm[1]);
        var info = DB.getShareDisplay(code);
        if (info) {
          var label = info.type === 'post' ? 'Post' : (info.type === 'gc' ? 'Group' : 'Community');
          return { url: url, host: host, title: label + ': ' + info.title, description: 'Open in Social Web', image: null };
        }
      }
      return { url: url, host: host, title: host + (u.pathname === '/' ? '' : u.pathname), description: 'Featured link', image: null };
    } catch (e) {
      return { url: url, host: '', title: url, description: '', image: null };
    }
  }

  function refreshAttachUI() {
    var box = document.getElementById('attach-preview');
    var count = document.getElementById('attach-count');
    if (!box) return;
    box.innerHTML = pendingFiles.map(function (f, i) {
      if (f.kind === 'image') {
        return '<div class="attach-chip"><button type="button" class="rm" data-i="' + i + '">×</button><img src="' + f.data + '" alt=""/><div>' + esc(f.name) + '</div></div>';
      }
      return '<div class="attach-chip"><button type="button" class="rm" data-i="' + i + '">×</button><div>📄 ' + esc(f.name) + '<br><span class="meta">' + formatBytes(f.size) + '</span></div></div>';
    }).join('');
    box.querySelectorAll('.rm').forEach(function (btn) {
      btn.onclick = function () {
        pendingFiles.splice(Number(btn.getAttribute('data-i')), 1);
        refreshAttachUI();
      };
    });
    if (count) count.textContent = pendingFiles.length ? (pendingFiles.length + ' file(s)') : '';
  }

  function refreshLinkPreview() {
    var box = document.getElementById('link-preview-box');
    if (!box) return;
    if (!pendingLink) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = '<a href="' + esc(pendingLink.url) + '" target="_blank" rel="noopener"><div class="lp-body"><div class="lp-host">' + esc(pendingLink.host) + ' · Featured link</div><div class="lp-title">' + esc(pendingLink.title) + '</div><div class="lp-desc">' + esc(pendingLink.description || '') + '</div></div></a>';
  }

  DB.createPost = function (author, content, extras) {
    extras = extras || {};
    var data = DB._load();
    var post = {
      id: DB._id('p'),
      author: author,
      content: (content || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      comments: [],
      likes: [],
      attachments: extras.attachments || [],
      featuredLink: extras.featuredLink || null
    };
    data.posts.unshift(post);
    try {
      DB._save(data);
    } catch (e) {
      data.posts.shift();
      return { ok: false, error: 'Storage full — try fewer/smaller files' };
    }
    return { ok: true, post: post };
  };

  function enhancePostCards() {
    document.querySelectorAll('.post-card').forEach(function (card) {
      if (card.getAttribute('data-att-done')) return;
      var id = card.getAttribute('data-id');
      if (!id || !DB.getPost) return;
      var p = DB.getPost(id);
      if (!p) return;
      card.setAttribute('data-att-done', '1');
      var contentEl = card.querySelector('.post-content');
      if (!contentEl) return;
      var html = '';
      if (p.featuredLink && p.featuredLink.url) {
        var L = p.featuredLink;
        html += '<div class="post-link-card"><a href="' + esc(L.url) + '" target="_blank" rel="noopener"><div class="lp-body"><div class="lp-host">' + esc(L.host || '') + '</div><div class="lp-title">' + esc(L.title || L.url) + '</div></div></a></div>';
      }
      if (p.attachments && p.attachments.length) {
        html += '<div class="post-attachments">';
        p.attachments.forEach(function (f) {
          if (f.kind === 'image' && f.data) {
            html += '<img src="' + f.data + '" alt="' + esc(f.name || '') + '"/>';
          } else if (f.data) {
            html += '<a class="file-chip" href="' + f.data + '" download="' + esc(f.name || 'file') + '">📄 ' + esc(f.name || 'file') + '</a>';
          }
        });
        html += '</div>';
      }
      if (html) contentEl.insertAdjacentHTML('afterend', html);
    });
  }

  if (document.body) {
    new MutationObserver(function () { enhancePostCards(); }).observe(document.body, { childList: true, subtree: true });
  }
  setInterval(enhancePostCards, 800);

  function wireCreate() {
    var ta = document.getElementById('post-content');
    var submit = document.getElementById('post-submit');
    var fileInput = document.getElementById('post-files');
    if (!ta || !submit) return;

    ta.addEventListener('input', function () {
      var urls = detectUrls(ta.value);
      pendingLink = urls.length ? buildLinkMeta(urls[0]) : null;
      refreshLinkPreview();
    });

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        Array.from(fileInput.files || []).forEach(function (file) {
          var reader = new FileReader();
          reader.onload = function () {
            pendingFiles.push({
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              kind: /^image\//.test(file.type) ? 'image' : 'file',
              data: reader.result
            });
            refreshAttachUI();
          };
          reader.readAsDataURL(file);
        });
        fileInput.value = '';
      });
    }

    submit.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var content = ta.value.trim();
      if (!content && !pendingFiles.length && !pendingLink) {
        alert('Write something or attach a file / link');
        return;
      }
      var r = DB.createPost(me, content, {
        attachments: pendingFiles.slice(),
        featuredLink: pendingLink
      });
      if (r && r.ok === false) {
        alert(r.error || 'Failed');
        return;
      }
      ta.value = '';
      pendingFiles = [];
      pendingLink = null;
      refreshAttachUI();
      refreshLinkPreview();
      location.hash = '#home';
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireCreate);
  } else {
    setTimeout(wireCreate, 100);
  }
})();
