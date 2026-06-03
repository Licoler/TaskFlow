(function () {
  var TOKEN_KEY = 'taskflow_token';
  var EMAIL_KEY = 'taskflow_email';

  function getApiBaseUrl() {
    return 'https://taskflow-crtp.onrender.com';
  }

  function request(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) options.headers.Authorization = 'Bearer ' + token;
    return fetch(getApiBaseUrl() + path, options).then(function (response) {
      return response.text().then(function (body) {
        var data = null;
        if (body) { try { data = JSON.parse(body); } catch(e) { data = { error: body }; } }
        if (!response.ok) {
          var err = new Error(data && data.error ? data.error : 'Request failed');
          err.status = response.status;
          throw err;
        }
        return data;
      });
    });
  }

  function authRequest(path, email, password) {
    return request(path, { method: 'POST', body: JSON.stringify({ email: email, password: password }) });
  }

  function fromApiTask(task) { return { id: task.id, title: task.title, done: task.status === 'done' }; }
  function statusFromDone(done) { return done ? 'done' : 'todo'; }
  function withAllDone(model) {
    var next = JSON.parse(JSON.stringify(model));
    var active = next.todos.filter(function (i) { return !i.done; });
    next.all_done = next.todos.length > 0 && active.length === 0;
    return next;
  }

  // ----- Рендер аутентификации -----
  function renderAuth(state, actions) {
    var section = document.createElement('section');
    section.className = 'auth-app';
    var title = document.createElement('h1');
    title.textContent = 'TaskFlow';
    var form = document.createElement('form');
    form.className = 'auth-form';
    var email = document.createElement('input');
    email.type = 'email';
    email.placeholder = 'Email';
    email.className = 'auth-input';
    email.value = state.email || '';
    var password = document.createElement('input');
    password.type = 'password';
    password.placeholder = 'Password';
    password.className = 'auth-input';
    var submit = document.createElement('button');
    submit.textContent = state.authMode === 'login' ? 'Log in' : 'Create account';
    submit.className = 'auth-submit';
    var switchBtn = document.createElement('button');
    switchBtn.textContent = state.authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in';
    switchBtn.className = 'auth-switch';
    var errorDiv = document.createElement('p');
    errorDiv.className = 'auth-error';
    errorDiv.textContent = state.error || '';

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      actions.authenticate(email.value, password.value);
    });
    switchBtn.addEventListener('click', function() { actions.switchMode(email.value); });

    form.appendChild(email);
    form.appendChild(password);
    form.appendChild(submit);
    form.appendChild(switchBtn);
    form.appendChild(errorDiv);
    section.appendChild(title);
    section.appendChild(form);
    return section;
  }

  // ----- Рендер главного интерфейса -----
  function renderShell(state, signal, actions) {
    var container = document.createElement('div');
    container.className = 'app-container';

    // Сайдбар
    var sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    var userDiv = document.createElement('div');
    userDiv.className = 'user-info';
    var userSpan = document.createElement('span');
    userSpan.className = 'user-email';
    userSpan.textContent = state.email || 'User';
    var logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Log out';
    logoutBtn.className = 'logout-btn';
    logoutBtn.addEventListener('click', actions.logout);
    userDiv.appendChild(userSpan);
    userDiv.appendChild(logoutBtn);
    sidebar.appendChild(userDiv);

    // Фильтры
    var filtersUl = document.createElement('ul');
    filtersUl.className = 'filters';
    var filterAll = createFilterLink('#/', 'All', state.model.hash === '#/');
    var filterActive = createFilterLink('#/active', 'Active', state.model.hash === '#/active');
    var filterCompleted = createFilterLink('#/completed', 'Completed', state.model.hash === '#/completed');
    filtersUl.appendChild(filterAll);
    filtersUl.appendChild(filterActive);
    filtersUl.appendChild(filterCompleted);
    sidebar.appendChild(filtersUl);
    container.appendChild(sidebar);

    // Основной контент
    var main = document.createElement('div');
    main.className = 'main-content';
    var todoCard = document.createElement('div');
    todoCard.className = 'todo-card';

    // Заголовок + прогресс
    var headerArea = document.createElement('div');
    headerArea.className = 'header-area';
    var h1 = document.createElement('h1');
    h1.innerHTML = '📋 TaskFlow';
    headerArea.appendChild(h1);
    var progressWrap = document.createElement('div');
    progressWrap.className = 'progress-container';
    var progressBar = document.createElement('div');
    progressBar.className = 'progress-bar-bg';
    var progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressBar.appendChild(progressFill);
    var progressStats = document.createElement('div');
    progressStats.className = 'progress-stats';
    var totalTasks = state.model.todos.length;
    var completedTasks = state.model.todos.filter(function(t) { return t.done; }).length;
    var percent = totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100;
    progressFill.style.width = percent + '%';
    progressStats.innerHTML = '<span>' + completedTasks + ' completed</span><span>' + (totalTasks - completedTasks) + ' remaining</span>';
    progressWrap.appendChild(progressBar);
    progressWrap.appendChild(progressStats);
    headerArea.appendChild(progressWrap);
    todoCard.appendChild(headerArea);

    // Поле ввода – только локальный обработчик Enter
    var inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';
    var inputIcon = document.createElement('span');
    inputIcon.className = 'input-icon';
    inputIcon.textContent = '✏️';
    var newInput = document.createElement('input');
    newInput.id = 'new-todo';
    newInput.className = 'new-todo';
    newInput.placeholder = 'What needs to be done?';
    newInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = newInput.value.trim();
        if (val) {
          signal('ADD')();
        }
      }
    });
    inputWrapper.appendChild(inputIcon);
    inputWrapper.appendChild(newInput);
    todoCard.appendChild(inputWrapper);

    // Список задач
    var todoList = document.createElement('ul');
    todoList.className = 'todo-list';
    var filteredTodos = state.model.todos.filter(function(todo) {
      if (state.model.hash === '#/active') return !todo.done;
      if (state.model.hash === '#/completed') return todo.done;
      return true;
    });
    filteredTodos.forEach(function(todo) {
      todoList.appendChild(renderTodoItem(todo, state.model, signal));
    });
    todoCard.appendChild(todoList);

    // Нижняя панель
    var footerPanel = document.createElement('div');
    footerPanel.className = 'footer-panel';
    var countSpan = document.createElement('span');
    countSpan.className = 'todo-count';
    var leftCount = state.model.todos.filter(function(t) { return !t.done; }).length;
    countSpan.textContent = leftCount + ' item' + (leftCount !== 1 ? 's' : '') + ' left';
    var clearBtn = document.createElement('button');
    clearBtn.className = 'clear-completed';
    clearBtn.textContent = 'Clear completed';
    clearBtn.addEventListener('click', signal('CLEAR_COMPLETED'));
    footerPanel.appendChild(countSpan);
    footerPanel.appendChild(clearBtn);
    todoCard.appendChild(footerPanel);
    main.appendChild(todoCard);
    container.appendChild(main);

    if (state.error) {
      var errDiv = document.createElement('div');
      errDiv.className = 'taskflow-error';
      errDiv.textContent = state.error;
      container.insertBefore(errDiv, container.firstChild);
    }

    return container;
  }

  function createFilterLink(hash, label, isSelected) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = hash;
    a.textContent = label;
    if (isSelected) a.classList.add('selected');
    a.addEventListener('click', function(e) {
      e.preventDefault();
      window.location.hash = hash;
    });
    li.appendChild(a);
    return li;
  }

  function renderTodoItem(item, model, signal) {
    var li = document.createElement('li');
    li.className = 'todo-item' + (item.done ? ' completed' : '');
    li.setAttribute('data-id', item.id);
    var check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'todo-checkbox';
    check.checked = item.done;
    check.addEventListener('change', signal('TOGGLE', item.id));
    var titleSpan = document.createElement('span');
    titleSpan.className = 'todo-title';
    titleSpan.textContent = item.title;
    var metaSpan = document.createElement('span');
    metaSpan.className = 'todo-meta';
    metaSpan.textContent = new Date().toLocaleDateString();
    var delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'delete-btn';
    delBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      signal('DELETE', item.id)();
    });
    li.appendChild(check);
    li.appendChild(titleSpan);
    li.appendChild(metaSpan);
    li.appendChild(delBtn);
    return li;
  }

  // ----- Логика приложения -----
  function mountTaskFlow(initialModel, rootElementId) {
    var root = document.getElementById(rootElementId);
    var state = {
      authMode: 'login',
      email: localStorage.getItem(EMAIL_KEY) || '',
      error: '',
      loading: false,
      model: JSON.parse(JSON.stringify(initialModel)),
      token: localStorage.getItem(TOKEN_KEY)
    };
    state.model.hash = window.location.hash || '#/';

    function render() {
      empty(root);
      root.appendChild(state.token ? renderShell(state, signal, actions) : renderAuth(state, actions));
    }

    function setError(err) {
      state.error = err.message || 'Something went wrong';
      if (err.status === 401) actions.logout();
      else render();
    }

    function loadTasks() {
      state.loading = true;
      render();
      return request('/api/tasks').then(function(tasks) {
        state.model.todos = tasks.map(fromApiTask);
        state.model = withAllDone(state.model);
        state.error = '';
        state.loading = false;
        render();
      }).catch(function(err) {
        state.loading = false;
        setError(err);
      });
    }

    function patchTask(id, body) { return request('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify(body) }); }

    function replaceTask(task) {
      var updated = fromApiTask(task);
      state.model.todos = state.model.todos.map(function(item) { return item.id === updated.id ? updated : item; });
      state.model = withAllDone(state.model);
      render();
    }

    function removeTask(id) {
      var el = document.querySelector('.todo-item[data-id="' + id + '"]');
      if (el) {
        el.classList.add('removing');
        setTimeout(function() {
          state.model.todos = state.model.todos.filter(function(t) { return t.id !== id; });
          state.model = withAllDone(state.model);
          render();
        }, 200);
      } else {
        state.model.todos = state.model.todos.filter(function(t) { return t.id !== id; });
        state.model = withAllDone(state.model);
        render();
      }
    }

    var actions = {
      authenticate: function(email, password) {
        state.email = email.trim().toLowerCase();
        state.error = '';
        state.loading = true;
        render();
        var path = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        authRequest(path, state.email, password).then(function(data) {
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(EMAIL_KEY, data.user.email);
          state.token = data.token;
          state.email = data.user.email;
          state.loading = false;
          loadTasks();
        }).catch(function(err) { state.loading = false; setError(err); });
      },
      logout: function() {
        localStorage.removeItem(TOKEN_KEY);
        state.token = '';
        state.model.todos = [];
        render();
      },
      switchMode: function(email) {
        state.email = email.trim().toLowerCase();
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        render();
      }
    };

    function signal(action, data) {
      return function callback() {
        switch(action) {
          case 'ADD':
            var input = document.getElementById('new-todo');
            var val = input ? input.value.trim() : '';
            if (!val) return;
            // Блокируем повторный вызов на время обработки
            if (input.disabled) return;
            input.disabled = true;
            request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: val, status: 'todo' }) }).then(function(task) {
              state.model.todos.push(fromApiTask(task));
              state.model = withAllDone(state.model);
              render();
              if (input) {
                input.value = '';
                input.disabled = false;
                input.focus();
              }
            }).catch(function(err) {
              setError(err);
              if (input) input.disabled = false;
            });
            break;
          case 'TOGGLE':
            var item = state.model.todos.find(function(t) { return t.id === data; });
            if (!item) return;
            patchTask(item.id, { status: statusFromDone(!item.done) }).then(replaceTask).catch(setError);
            break;
          case 'TOGGLE_ALL':
            var nextDone = !state.model.all_done;
            Promise.all(state.model.todos.map(function(t) { return patchTask(t.id, { status: statusFromDone(nextDone) }); }))
              .then(function(tasks) { state.model.todos = tasks.map(fromApiTask); state.model = withAllDone(state.model); render(); })
              .catch(setError);
            break;
          case 'DELETE':
            request('/api/tasks/' + data, { method: 'DELETE' }).then(function() { removeTask(data); }).catch(setError);
            break;
          case 'CLEAR_COMPLETED':
            var completedIds = state.model.todos.filter(function(t) { return t.done; }).map(function(t) { return t.id; });
            Promise.all(completedIds.map(function(id) { return request('/api/tasks/' + id, { method: 'DELETE' }); }))
              .then(function() {
                state.model.todos = state.model.todos.filter(function(t) { return !t.done; });
                state.model = withAllDone(state.model);
                render();
              }).catch(setError);
            break;
          default:
            state.model = update(action, state.model, data);
            render();
        }
      };
    }

    // Отключаем глобальную подписку на ADD, оставляем только редактирование и роутинг
    if (typeof subscriptions === 'function') {
      var originalSubs = subscriptions;
      var patchedSubs = function(sig) {
        var wrapped = function(action, data) {
          if (action === 'ADD') return;
          return sig(action, data);
        };
        originalSubs(wrapped);
      };
      patchedSubs(signal);
    }

    window.onhashchange = function() {
      state.model.hash = window.location.hash || '#/';
      render();
    };

    render();
    if (state.token) loadTasks();
  }

  window.mountTaskFlow = mountTaskFlow;
})();