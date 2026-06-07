(function () {
  var TOKEN_KEY = 'taskflow_token';
  var EMAIL_KEY = 'taskflow_email';
  var API_BASE   = 'https://taskflow-crtp.onrender.com';

  // ─── Storage helpers ─────────────────────────────────────────────────────────

  function request(path, options) {
    var opts = options || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers);
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) opts.headers.Authorization = 'Bearer ' + token;

    return fetch(API_BASE + path, opts).then(function (response) {
      return response.text().then(function (body) {
        var data = null;
        if (body) {
          try { data = JSON.parse(body); } catch (e) { data = { error: body }; }
        }
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

  // ─── Extra fields (local deadline/category storage) ───────────────────────────

  function extraKey(id) { return 'taskflow_extra_' + id; }

  function getExtraFields(taskId) {
    var raw = localStorage.getItem(extraKey(taskId));
    return raw ? JSON.parse(raw) : { category: 'personal', deadline: '' };
  }

  function setExtraFields(taskId, category, deadline) {
    localStorage.setItem(extraKey(taskId), JSON.stringify({ category: category, deadline: deadline || '' }));
  }

  function deleteExtraFields(taskId) {
    localStorage.removeItem(extraKey(taskId));
  }

  // ─── Model helpers ────────────────────────────────────────────────────────────

  function fromApiTask(task) {
    var extra = getExtraFields(task.id);
    return { id: task.id, title: task.title, done: task.status === 'done', deadline: extra.deadline, category: extra.category };
  }

  function statusFromDone(done) { return done ? 'done' : 'todo'; }

  function withAllDone(model) {
    var active = model.todos.filter(function (i) { return !i.done; });
    model.all_done = model.todos.length > 0 && active.length === 0;
    return model;
  }

  function isOverdue(deadlineStr) {
    if (!deadlineStr) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(deadlineStr) < today;
  }

  // ─── DOM helpers ──────────────────────────────────────────────────────────────

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function createFilterLink(hash, labelText, isSelected) {
    var li = el('li');
    var a = el('a');
    a.href = hash;
    a.textContent = labelText;
    if (isSelected) a.classList.add('selected');
    a.addEventListener('click', function (e) { e.preventDefault(); window.location.hash = hash; });
    li.appendChild(a);
    return li;
  }

  function empty(node) {
    while (node.lastChild) node.removeChild(node.lastChild);
  }

  // ─── Progress & counter (DOM mutation, no re-render) ─────────────────────────

  function updateProgressAndConfetti(model) {
    var fill  = document.querySelector('.progress-fill');
    var stats = document.querySelector('.progress-stats');
    if (!fill || !stats) return;

    var total     = model.todos.length;
    var completed = model.todos.filter(function (t) { return t.done; }).length;
    var percent   = total === 0 ? 0 : (completed / total) * 100;

    fill.style.width = percent + '%';
    stats.innerHTML  = '<span>' + completed + ' completed</span><span>' + (total - completed) + ' remaining</span>';

    if (total > 0 && completed === total && typeof confetti === 'function') {
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 }, startVelocity: 30 });
    }
  }

  function updateCounter(model) {
    var countSpan = document.querySelector('.todo-count');
    if (!countSpan) return;
    var left = model.todos.filter(function (t) { return !t.done; }).length;
    countSpan.textContent = left + ' item' + (left !== 1 ? 's' : '') + ' left';
  }

  // ─── Auth view ────────────────────────────────────────────────────────────────

  function renderAuth(state, actions) {
    var section = el('section', 'auth-app');
    var title   = el('h1');
    title.textContent = 'TaskFlow';

    var form     = el('form', 'auth-form');
    var emailEl  = el('input', 'auth-input');
    emailEl.type        = 'email';
    emailEl.placeholder = 'Email';
    emailEl.value       = state.email || '';

    var passwordEl  = el('input', 'auth-input');
    passwordEl.type = 'password';
    passwordEl.placeholder = 'Password';

    var submit       = el('button', 'auth-submit');
    submit.type      = 'submit';
    submit.textContent = state.authMode === 'login' ? 'Log in' : 'Create account';

    var switchBtn        = el('button', 'auth-switch');
    switchBtn.type       = 'button';
    switchBtn.textContent = state.authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in';

    var errorDiv = el('p', 'auth-error');
    errorDiv.textContent = state.error || '';

    form.addEventListener('submit', function (e) { e.preventDefault(); actions.authenticate(emailEl.value, passwordEl.value); });
    switchBtn.addEventListener('click', function () { actions.switchMode(emailEl.value); });

    [emailEl, passwordEl, submit, switchBtn, errorDiv].forEach(function (c) { form.appendChild(c); });
    section.appendChild(title);
    section.appendChild(form);
    return section;
  }

  // ─── Todo item view ───────────────────────────────────────────────────────────

  function renderTodoItem(item, model, signal, renderFull) {
    var li = el('li', 'todo-item' + (item.done ? ' completed' : ''));
    if (isOverdue(item.deadline) && !item.done) li.classList.add('overdue');
    li.setAttribute('data-id', item.id);

    var check = el('input');
    check.type = 'checkbox';
    check.className = 'todo-checkbox';
    check.checked = item.done;
    check.addEventListener('change', function (e) { e.stopPropagation(); toggleTask(item, signal, model, renderFull); });

    var titleSpan = el('span', 'todo-title');
    titleSpan.textContent = item.title;

    var categorySpan = el('span', 'todo-category ' + item.category);
    categorySpan.textContent = ({ personal: '👤 Personal', work: '💼 Work', study: '📚 Study' })[item.category] || '📌';

    var deadlineSpan = el('span', 'todo-deadline');
    if (item.deadline) {
      deadlineSpan.textContent = new Date(item.deadline).toLocaleDateString();
      if (isOverdue(item.deadline) && !item.done) deadlineSpan.classList.add('overdue');
    } else {
      deadlineSpan.textContent = '📅 No date';
    }

    var delBtn = el('button', 'delete-btn');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', function (e) { e.stopPropagation(); signal('DELETE', item.id)(); });

    [check, titleSpan, categorySpan, deadlineSpan, delBtn].forEach(function (c) { li.appendChild(c); });
    li.addEventListener('dblclick', function () { enterEditMode(li, item, signal, renderFull); });
    return li;
  }

  function toggleTask(item, signal, model, renderFull) {
    var liEl    = document.querySelector('.todo-item[data-id="' + item.id + '"]');
    var check   = liEl && liEl.querySelector('.todo-checkbox');
    var newDone = !item.done;

    if (check) check.checked = newDone;
    if (liEl) liEl.classList.toggle('completed', newDone);

    item.done = newDone;
    var modelItem = model.todos.find(function (t) { return t.id === item.id; });
    if (modelItem) modelItem.done = newDone;

    withAllDone(model);
    updateProgressAndConfetti(model);
    updateCounter(model);

    request('/api/tasks/' + item.id, { method: 'PATCH', body: JSON.stringify({ status: statusFromDone(newDone) }) })
      .catch(function () {
        item.done = !newDone;
        if (modelItem) modelItem.done = !newDone;
        if (check) check.checked = !newDone;
        if (liEl) liEl.classList.toggle('completed', !newDone);
        withAllDone(model);
        updateProgressAndConfetti(model);
        updateCounter(model);
      });
  }

  function enterEditMode(li, item, signal, renderFull) {
    var oldContent = li.innerHTML;
    li.innerHTML = '';

    var form           = el('div', 'edit-form');
    var titleInput     = el('input', 'edit-input');
    titleInput.type    = 'text';
    titleInput.value   = item.title;

    var deadlineInput  = el('input', 'edit-deadline');
    deadlineInput.type = 'date';
    deadlineInput.value = item.deadline ? item.deadline.slice(0, 10) : '';

    var categorySelect = el('select', 'edit-category');
    [{ value: 'personal', label: '👤 Personal' }, { value: 'work', label: '💼 Work' }, { value: 'study', label: '📚 Study' }]
      .forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat.value;
        opt.textContent = cat.label;
        if (cat.value === item.category) opt.selected = true;
        categorySelect.appendChild(opt);
      });

    var saveBtn    = el('button', 'auth-submit');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '4px 12px';

    var cancelBtn  = el('button', 'logout-btn');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '4px 12px';

    [titleInput, deadlineInput, categorySelect, saveBtn, cancelBtn].forEach(function (c) { form.appendChild(c); });
    li.appendChild(form);

    function saveEdit() {
      var newTitle    = titleInput.value.trim();
      var newDeadline = deadlineInput.value || null;
      var newCategory = categorySelect.value;
      if (!newTitle) return;

      request('/api/tasks/' + item.id, { method: 'PATCH', body: JSON.stringify({ title: newTitle }) })
        .then(function (updatedTask) {
          item.title    = updatedTask.title;
          item.deadline = newDeadline;
          item.category = newCategory;
          setExtraFields(item.id, item.category, item.deadline);

          var newLi = renderTodoItem(item, window._taskflow_model, signal, renderFull);
          li.parentNode.replaceChild(newLi, li);

          var idx = window._taskflow_model.todos.findIndex(function (t) { return t.id === item.id; });
          if (idx !== -1) window._taskflow_model.todos[idx] = item;

          updateProgressAndConfetti(window._taskflow_model);
          updateCounter(window._taskflow_model);
        })
        .catch(function () { li.innerHTML = oldContent; });
    }

    saveBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', function () { li.innerHTML = oldContent; });
    titleInput.focus();
  }

  function deleteTaskWithAnimation(id, model, renderFull) {
    var domEl = document.querySelector('.todo-item[data-id="' + id + '"]');
    function removeFromModel() {
      model.todos = model.todos.filter(function (t) { return t.id !== id; });
      deleteExtraFields(id);
      renderFull(model);
    }
    if (domEl) {
      domEl.classList.add('removing');
      setTimeout(removeFromModel, 200);
    } else {
      removeFromModel();
    }
  }

  // ─── Shell sub-renders ────────────────────────────────────────────────────────

  function renderSidebar(state, actions, renderFull) {
    var sidebar = el('div', 'sidebar');

    var userDiv  = el('div', 'user-info');
    var userSpan = el('span', 'user-email');
    userSpan.textContent = state.email || 'User';

    var logoutBtn = el('button', 'logout-btn');
    logoutBtn.textContent = 'Log out';
    logoutBtn.addEventListener('click', actions.logout);

    userDiv.appendChild(userSpan);
    userDiv.appendChild(logoutBtn);
    sidebar.appendChild(userDiv);

    var filtersUl = el('ul', 'filters');
    [['#/', 'All', state.model.hash === '#/'],
     ['#/active', 'Active', state.model.hash === '#/active'],
     ['#/completed', 'Completed', state.model.hash === '#/completed']]
      .forEach(function (f) { filtersUl.appendChild(createFilterLink(f[0], f[1], f[2])); });
    sidebar.appendChild(filtersUl);

    var categoryDiv = el('div', 'category-filters');
    [{ id: 'all', label: 'All categories' }, { id: 'personal', label: '👤 Personal' },
     { id: 'work', label: '💼 Work' }, { id: 'study', label: '📚 Study' }]
      .forEach(function (cat) {
        var btn = el('button', 'category-btn' + (state.model.categoryFilter === cat.id ? ' active' : ''));
        btn.textContent = cat.label;
        btn.addEventListener('click', function () {
          state.model.categoryFilter = cat.id;
          renderFull(state.model);
        });
        categoryDiv.appendChild(btn);
      });
    sidebar.appendChild(categoryDiv);
    return sidebar;
  }

  function renderProgressBar() {
    var wrap  = el('div', 'progress-container');
    var bg    = el('div', 'progress-bar-bg');
    var fill  = el('div', 'progress-fill');
    bg.appendChild(fill);
    var stats = el('div', 'progress-stats');
    wrap.appendChild(bg);
    wrap.appendChild(stats);
    return wrap;
  }

  function renderAddForm(state, signal, renderFull) {
    var addForm = el('div');
    addForm.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px';

    var inputWrapper = el('div');
    inputWrapper.style.cssText = 'flex:3;position:relative';
    var inputIcon = el('span', 'input-icon');
    inputIcon.textContent = '✏️';
    var newInput = el('input', 'new-todo');
    newInput.id          = 'new-todo';
    newInput.placeholder = 'What needs to be done?';
    newInput.style.width = '100%';
    inputWrapper.appendChild(inputIcon);
    inputWrapper.appendChild(newInput);
    addForm.appendChild(inputWrapper);

    var catSelect = el('select', 'edit-category');
    catSelect.id  = 'new-category';
    catSelect.style.cssText = 'padding:8px 12px;border-radius:40px;background:rgba(0,0,0,0.4);color:white;border:1px solid var(--border)';
    [{ value: 'personal', label: '👤 Personal' }, { value: 'work', label: '💼 Work' }, { value: 'study', label: '📚 Study' }]
      .forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        catSelect.appendChild(option);
      });
    catSelect.style.display = (state.model.categoryFilter === 'all') ? 'inline-block' : 'none';
    addForm.appendChild(catSelect);

    var deadlineInput  = el('input', 'edit-deadline');
    deadlineInput.type = 'date';
    deadlineInput.id   = 'new-deadline';
    deadlineInput.style.cssText = 'padding:8px 12px;border-radius:40px;background:rgba(0,0,0,0.4);color:white;border:1px solid var(--border)';
    addForm.appendChild(deadlineInput);

    var addBtn = el('button', 'auth-submit');
    addBtn.textContent  = '+ Add';
    addBtn.style.cssText = 'padding:8px 20px;width:auto';
    addBtn.addEventListener('click', function () {
      if (newInput.value.trim()) signal('ADD')();
    });
    newInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (newInput.value.trim()) signal('ADD')(); }
    });
    addForm.appendChild(addBtn);
    return addForm;
  }

  function renderTodoList(state, signal, renderFull) {
    var todoList = el('ul', 'todo-list');
    state.model.todos
      .filter(function (todo) {
        var statusOk   = state.model.hash === '#/active'    ? !todo.done :
                         state.model.hash === '#/completed' ? todo.done : true;
        var categoryOk = state.model.categoryFilter === 'all' || todo.category === state.model.categoryFilter;
        return statusOk && categoryOk;
      })
      .forEach(function (todo) {
        todoList.appendChild(renderTodoItem(todo, state.model, signal, renderFull));
      });
    return todoList;
  }

  function renderFooterPanel(state, signal) {
    var panel = el('div', 'footer-panel');
    var countSpan = el('span', 'todo-count');
    var left = state.model.todos.filter(function (t) { return !t.done; }).length;
    countSpan.textContent = left + ' item' + (left !== 1 ? 's' : '') + ' left';

    var clearBtn = el('button', 'clear-completed');
    clearBtn.textContent = 'Clear completed';
    clearBtn.addEventListener('click', signal('CLEAR_COMPLETED'));

    panel.appendChild(countSpan);
    panel.appendChild(clearBtn);
    return panel;
  }

  // ─── Shell ────────────────────────────────────────────────────────────────────

  function renderShell(state, signal, actions, renderFull) {
    var container = el('div', 'app-container');
    container.appendChild(renderSidebar(state, actions, renderFull));

    var main     = el('div', 'main-content');
    var todoCard = el('div', 'todo-card');

    var headerArea = el('div', 'header-area');
    var h1el = el('h1');
    h1el.innerHTML = '📋 TaskFlow';
    headerArea.appendChild(h1el);
    headerArea.appendChild(renderProgressBar());
    todoCard.appendChild(headerArea);

    todoCard.appendChild(renderAddForm(state, signal, renderFull));
    todoCard.appendChild(renderTodoList(state, signal, renderFull));
    todoCard.appendChild(renderFooterPanel(state, signal));

    main.appendChild(todoCard);
    container.appendChild(main);

    if (state.error) {
      var errDiv = el('div', 'taskflow-error');
      errDiv.textContent = state.error;
      container.insertBefore(errDiv, container.firstChild);
    }

    return container;
  }

  // ─── Signal handlers ──────────────────────────────────────────────────────────

  function handleAdd(state, signal, renderFull, setError) {
    var inputEl = document.getElementById('new-todo');
    var val = inputEl ? inputEl.value.trim() : '';
    if (!val || inputEl.disabled) return;
    inputEl.disabled = true;

    var category = state.model.categoryFilter !== 'all'
      ? state.model.categoryFilter
      : (document.getElementById('new-category') || {}).value || 'personal';
    var deadlineEl = document.getElementById('new-deadline');
    var deadline = deadlineEl ? deadlineEl.value : '';

    request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: val, status: 'todo' }) })
      .then(function (task) {
        var newTask = fromApiTask(task);
        newTask.category = category;
        newTask.deadline = deadline;
        setExtraFields(newTask.id, category, deadline);
        state.model.todos.push(newTask);
        state.model = withAllDone(state.model);

        var todoList = document.querySelector('.todo-list');
        if (todoList) {
          todoList.appendChild(renderTodoItem(newTask, state.model, signal, renderFull));
          updateProgressAndConfetti(state.model);
          updateCounter(state.model);
        } else {
          renderFull(state.model);
        }

        if (inputEl) { inputEl.value = ''; inputEl.disabled = false; inputEl.focus(); }
        if (deadlineEl) deadlineEl.value = '';
      })
      .catch(setError);
  }

  function handleDelete(data, state, renderFull, setError) {
    request('/api/tasks/' + data, { method: 'DELETE' })
      .then(function () { deleteTaskWithAnimation(data, state.model, renderFull); })
      .catch(setError);
  }

  function handleClearCompleted(state, renderFull, setError) {
    var ids = state.model.todos.filter(function (t) { return t.done; }).map(function (t) { return t.id; });
    Promise.all(ids.map(function (id) { return request('/api/tasks/' + id, { method: 'DELETE' }); }))
      .then(function () {
        state.model.todos = state.model.todos.filter(function (t) { return !t.done; });
        ids.forEach(deleteExtraFields);
        state.model = withAllDone(state.model);
        renderFull(state.model);
      })
      .catch(setError);
  }

  function handleToggleAll(state, renderFull, setError) {
    var nextDone = !state.model.all_done;
    Promise.all(state.model.todos.map(function (t) {
      return request('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify({ status: statusFromDone(nextDone) }) });
    }))
      .then(function (tasks) {
        state.model.todos = tasks.map(function (t) {
          var extra = getExtraFields(t.id);
          return { id: t.id, title: t.title, done: t.status === 'done', deadline: extra.deadline, category: extra.category };
        });
        state.model = withAllDone(state.model);
        renderFull(state.model);
      })
      .catch(setError);
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mountTaskFlow(initialModel, rootElementId) {
    var root  = document.getElementById(rootElementId);
    var state = {
      authMode: 'login',
      email:    localStorage.getItem(EMAIL_KEY) || '',
      error:    '',
      loading:  false,
      model:    JSON.parse(JSON.stringify(initialModel)),
      token:    localStorage.getItem(TOKEN_KEY)
    };
    state.model.hash = window.location.hash || '#/';
    if (!state.model.categoryFilter) state.model.categoryFilter = 'all';
    window._taskflow_model = state.model;

    function renderFull(model) {
      if (!root) return;
      state.model = model;
      window._taskflow_model = model;
      empty(root);
      if (!state.token) {
        root.appendChild(renderAuth(state, actions));
      } else {
        root.appendChild(renderShell(state, signal, actions, renderFull));
        updateProgressAndConfetti(model);
        updateCounter(model);
      }
    }

    function setError(err) {
      state.error = err.message || 'Something went wrong';
      if (err.status === 401) actions.logout();
      else renderFull(state.model);
    }

    function loadTasks() {
      state.loading = true;
      renderFull(state.model);
      return request('/api/tasks')
        .then(function (tasks) {
          state.model.todos = tasks.map(fromApiTask);
          state.model = withAllDone(state.model);
          state.error   = '';
          state.loading = false;
          renderFull(state.model);
        })
        .catch(function (err) { state.loading = false; setError(err); });
    }

    var actions = {
      authenticate: function (email, password) {
        state.email   = email.trim().toLowerCase();
        state.error   = '';
        state.loading = true;
        renderFull(state.model);
        var path = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        authRequest(path, state.email, password)
          .then(function (data) {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(EMAIL_KEY, data.user.email);
            state.token   = data.token;
            state.email   = data.user.email;
            state.loading = false;
            loadTasks();
          })
          .catch(function (err) { state.loading = false; setError(err); });
      },
      logout: function () {
        localStorage.removeItem(TOKEN_KEY);
        state.token = '';
        state.model.todos = [];
        renderFull(state.model);
      },
      switchMode: function (email) {
        state.email    = email.trim().toLowerCase();
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        renderFull(state.model);
      }
    };

    function signal(action, data) {
      return function callback() {
        switch (action) {
          case 'ADD':             handleAdd(state, signal, renderFull, setError);           break;
          case 'DELETE':          handleDelete(data, state, renderFull, setError);          break;
          case 'CLEAR_COMPLETED': handleClearCompleted(state, renderFull, setError);        break;
          case 'TOGGLE_ALL':      handleToggleAll(state, renderFull, setError);             break;
          default:                state.model = update(action, state.model, data); renderFull(state.model);
        }
      };
    }

    window.onhashchange = function () {
      state.model.hash = window.location.hash || '#/';
      renderFull(state.model);
    };

    renderFull(state.model);
    if (state.token) loadTasks();
  }

  window.mountTaskFlow = mountTaskFlow;
})();