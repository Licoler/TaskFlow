(function () {
  var TOKEN_KEY = 'taskflow_token';
  var EMAIL_KEY = 'taskflow_email';
  var API_BASE  = 'https://taskflow-crtp.onrender.com';

  var CATEGORIES = [
    { value: 'personal', label: '👤 Personal' },
    { value: 'work',     label: '💼 Work'      },
    { value: 'study',    label: '📚 Study'     }
  ];

  var CATEGORY_LABELS = { personal: '👤 Personal', work: '💼 Work', study: '📚 Study' };

  // ─── HTTP ─────────────────────────────────────────────────────────────────────

  function parseBody(body) {
    try { return body ? JSON.parse(body) : null; } catch (e) { return { error: body }; }
  }

  function checkResponse(response, data) {
    if (response.ok) return data;
    var err = new Error(data && data.error ? data.error : 'Request failed');
    err.status = response.status;
    throw err;
  }

  function handleResponse(response) {
    return response.text().then(function (body) {
      return checkResponse(response, parseBody(body));
    });
  }

  function buildHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function request(path, options) {
    var opts = Object.assign({}, options || {});
    opts.headers = buildHeaders();
    return fetch(API_BASE + path, opts).then(handleResponse);
  }

  function authRequest(path, email, password) {
    return request(path, { method: 'POST', body: JSON.stringify({ email: email, password: password }) });
  }

  // ─── Local storage extras ─────────────────────────────────────────────────────

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
    model.all_done = model.todos.length > 0 && model.todos.every(function (t) { return t.done; });
    return model;
  }

  function isOverdue(deadlineStr) {
    if (!deadlineStr) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(deadlineStr) < today;
  }

  // ─── DOM utilities ────────────────────────────────────────────────────────────

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function empty(node) {
    while (node.lastChild) node.removeChild(node.lastChild);
  }

  function appendAll(parent, children) {
    children.forEach(function (c) { parent.appendChild(c); });
    return parent;
  }

  // ─── Progress / counter ───────────────────────────────────────────────────────

  function updateProgressAndConfetti(model) {
    var fill  = document.querySelector('.progress-fill');
    var stats = document.querySelector('.progress-stats');
    if (!fill || !stats) return;
    var total     = model.todos.length;
    var completed = model.todos.filter(function (t) { return t.done; }).length;
    fill.style.width = (total === 0 ? 0 : (completed / total) * 100) + '%';
    stats.innerHTML = '<span>' + completed + ' completed</span><span>' + (total - completed) + ' remaining</span>';
    if (total > 0 && completed === total && typeof confetti === 'function') {
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 }, startVelocity: 30 });
    }
  }

  function updateCounter(model) {
    var span = document.querySelector('.todo-count');
    if (!span) return;
    var left = model.todos.filter(function (t) { return !t.done; }).length;
    span.textContent = left + ' item' + (left !== 1 ? 's' : '') + ' left';
  }

  // ─── Filter link ──────────────────────────────────────────────────────────────

  function onFilterClick(hash) {
    return function (e) { e.preventDefault(); window.location.hash = hash; };
  }

  function createFilterLink(hash, labelText, isSelected) {
    var li = el('li');
    var a  = el('a');
    a.href        = hash;
    a.textContent = labelText;
    if (isSelected) a.classList.add('selected');
    a.addEventListener('click', onFilterClick(hash));
    li.appendChild(a);
    return li;
  }

  // ─── Auth view ────────────────────────────────────────────────────────────────

  function makeAuthInput(type, placeholder, value) {
    var input = el('input', 'auth-input');
    input.type        = type;
    input.placeholder = placeholder;
    if (value) input.value = value;
    return input;
  }

  function renderAuth(state, actions) {
    var emailEl    = makeAuthInput('email', 'Email', state.email || '');
    var passwordEl = makeAuthInput('password', 'Password', '');

    var submit       = el('button', 'auth-submit');
    submit.type      = 'submit';
    submit.textContent = state.authMode === 'login' ? 'Log in' : 'Create account';

    var switchBtn        = el('button', 'auth-switch');
    switchBtn.type       = 'button';
    switchBtn.textContent = state.authMode === 'login'
      ? 'Need an account? Register'
      : 'Already have an account? Log in';

    var errorDiv = el('p', 'auth-error');
    errorDiv.textContent = state.error || '';

    var form = el('form', 'auth-form');
    appendAll(form, [emailEl, passwordEl, submit, switchBtn, errorDiv]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      actions.authenticate(emailEl.value, passwordEl.value);
    });
    switchBtn.addEventListener('click', function () { actions.switchMode(emailEl.value); });

    var title = el('h1');
    title.textContent = 'TaskFlow';

    var section = el('section', 'auth-app');
    section.appendChild(title);
    section.appendChild(form);
    return section;
  }

  // ─── Todo item: deadline span ─────────────────────────────────────────────────

  function makeDeadlineSpan(item) {
    var span = el('span', 'todo-deadline');
    if (item.deadline) {
      span.textContent = new Date(item.deadline).toLocaleDateString();
      if (isOverdue(item.deadline) && !item.done) span.classList.add('overdue');
    } else {
      span.textContent = '📅 No date';
    }
    return span;
  }

  // ─── Todo item: checkbox ──────────────────────────────────────────────────────

  function makeCheckbox(item, model, signal, renderFull) {
    var check = el('input');
    check.type      = 'checkbox';
    check.className = 'todo-checkbox';
    check.checked   = item.done;
    check.addEventListener('change', function (e) {
      e.stopPropagation();
      toggleTask(item, signal, model, renderFull);
    });
    return check;
  }

  // ─── Todo item ────────────────────────────────────────────────────────────────

  function renderTodoItem(item, model, signal, renderFull) {
    var liClass = 'todo-item' + (item.done ? ' completed' : '');
    var li = el('li', liClass);
    if (isOverdue(item.deadline) && !item.done) li.classList.add('overdue');
    li.setAttribute('data-id', item.id);

    var titleSpan = el('span', 'todo-title');
    titleSpan.textContent = item.title;

    var catSpan = el('span', 'todo-category ' + item.category);
    catSpan.textContent = CATEGORY_LABELS[item.category] || '📌';

    var delBtn = el('button', 'delete-btn');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      signal('DELETE', item.id)();
    });

    appendAll(li, [makeCheckbox(item, model, signal, renderFull), titleSpan, catSpan, makeDeadlineSpan(item), delBtn]);
    li.addEventListener('dblclick', function () { enterEditMode(li, item, signal, renderFull); });
    return li;
  }

  // ─── Toggle (optimistic update) ───────────────────────────────────────────────

  function applyToggleToDom(liEl, check, done) {
    if (check) check.checked = done;
    if (liEl) liEl.classList.toggle('completed', done);
  }

  function toggleTask(item, signal, model, renderFull) {
    var liEl      = document.querySelector('.todo-item[data-id="' + item.id + '"]');
    var check     = liEl && liEl.querySelector('.todo-checkbox');
    var newDone   = !item.done;
    var modelItem = model.todos.find(function (t) { return t.id === item.id; });

    item.done = newDone;
    if (modelItem) modelItem.done = newDone;
    applyToggleToDom(liEl, check, newDone);
    withAllDone(model);
    updateProgressAndConfetti(model);
    updateCounter(model);

    request('/api/tasks/' + item.id, { method: 'PATCH', body: JSON.stringify({ status: statusFromDone(newDone) }) })
      .catch(function () {
        item.done = !newDone;
        if (modelItem) modelItem.done = !newDone;
        applyToggleToDom(liEl, check, !newDone);
        withAllDone(model);
        updateProgressAndConfetti(model);
        updateCounter(model);
      });
  }

  // ─── Edit mode ────────────────────────────────────────────────────────────────

  function makeCategorySelect(currentCategory) {
    var select = el('select', 'edit-category');
    CATEGORIES.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value       = cat.value;
      opt.textContent = cat.label;
      if (cat.value === currentCategory) opt.selected = true;
      select.appendChild(opt);
    });
    return select;
  }

  function applyEditSave(li, item, updatedTask, newDeadline, newCategory, signal, renderFull) {
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
  }

  function buildEditForm(item, li, signal, renderFull) {
    var oldContent     = li.innerHTML;
    var titleInput     = el('input', 'edit-input');
    titleInput.type    = 'text';
    titleInput.value   = item.title;

    var deadlineInput  = el('input', 'edit-deadline');
    deadlineInput.type = 'date';
    deadlineInput.value = item.deadline ? item.deadline.slice(0, 10) : '';

    var categorySelect = makeCategorySelect(item.category);

    var saveBtn = el('button', 'auth-submit');
    saveBtn.textContent   = 'Save';
    saveBtn.style.padding = '4px 12px';

    var cancelBtn = el('button', 'logout-btn');
    cancelBtn.textContent   = 'Cancel';
    cancelBtn.style.padding = '4px 12px';

    saveBtn.addEventListener('click', function () {
      var newTitle = titleInput.value.trim();
      if (!newTitle) return;
      request('/api/tasks/' + item.id, { method: 'PATCH', body: JSON.stringify({ title: newTitle }) })
        .then(function (updated) { applyEditSave(li, item, updated, deadlineInput.value || null, categorySelect.value, signal, renderFull); })
        .catch(function () { li.innerHTML = oldContent; });
    });
    cancelBtn.addEventListener('click', function () { li.innerHTML = oldContent; });

    var form = el('div', 'edit-form');
    appendAll(form, [titleInput, deadlineInput, categorySelect, saveBtn, cancelBtn]);
    return { form: form, titleInput: titleInput };
  }

  function enterEditMode(li, item, signal, renderFull) {
    li.innerHTML = '';
    var built = buildEditForm(item, li, signal, renderFull);
    li.appendChild(built.form);
    built.titleInput.focus();
  }

  // ─── Delete with animation ────────────────────────────────────────────────────

  function removeFromModel(id, model, renderFull) {
    model.todos = model.todos.filter(function (t) { return t.id !== id; });
    deleteExtraFields(id);
    renderFull(model);
  }

  function deleteTaskWithAnimation(id, model, renderFull) {
    var domEl = document.querySelector('.todo-item[data-id="' + id + '"]');
    if (domEl) {
      domEl.classList.add('removing');
      setTimeout(function () { removeFromModel(id, model, renderFull); }, 200);
    } else {
      removeFromModel(id, model, renderFull);
    }
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────────

  function makeCategoryBtn(cat, currentFilter, onClickFn) {
    var btn = el('button', 'category-btn' + (currentFilter === cat.id ? ' active' : ''));
    btn.textContent = cat.label;
    btn.addEventListener('click', onClickFn);
    return btn;
  }

  function renderSidebar(state, actions, renderFull) {
    var userSpan = el('span', 'user-email');
    userSpan.textContent = state.email || 'User';

    var logoutBtn = el('button', 'logout-btn');
    logoutBtn.textContent = 'Log out';
    logoutBtn.addEventListener('click', actions.logout);

    var userDiv = el('div', 'user-info');
    appendAll(userDiv, [userSpan, logoutBtn]);

    var filtersUl = el('ul', 'filters');
    [['#/', 'All', state.model.hash === '#/'],
     ['#/active', 'Active', state.model.hash === '#/active'],
     ['#/completed', 'Completed', state.model.hash === '#/completed']]
      .forEach(function (f) { filtersUl.appendChild(createFilterLink(f[0], f[1], f[2])); });

    var catFilters = [
      { id: 'all',      label: 'All categories' },
      { id: 'personal', label: '👤 Personal'    },
      { id: 'work',     label: '💼 Work'         },
      { id: 'study',    label: '📚 Study'        }
    ];
    var categoryDiv = el('div', 'category-filters');
    catFilters.forEach(function (cat) {
      categoryDiv.appendChild(makeCategoryBtn(cat, state.model.categoryFilter, function () {
        state.model.categoryFilter = cat.id;
        renderFull(state.model);
      }));
    });

    var sidebar = el('div', 'sidebar');
    appendAll(sidebar, [userDiv, filtersUl, categoryDiv]);
    return sidebar;
  }

  // ─── Progress bar ─────────────────────────────────────────────────────────────

  function renderProgressBar() {
    var fill = el('div', 'progress-fill');
    var bg   = el('div', 'progress-bar-bg');
    bg.appendChild(fill);
    var stats = el('div', 'progress-stats');
    var wrap  = el('div', 'progress-container');
    appendAll(wrap, [bg, stats]);
    return wrap;
  }

  // ─── Add form ─────────────────────────────────────────────────────────────────

  function makeNewInput() {
    var icon = el('span', 'input-icon');
    icon.textContent = '✏️';
    var input = el('input', 'new-todo');
    input.id          = 'new-todo';
    input.placeholder = 'What needs to be done?';
    input.style.width = '100%';
    var wrap = el('div');
    wrap.style.cssText = 'flex:3;position:relative';
    appendAll(wrap, [icon, input]);
    return { wrap: wrap, input: input };
  }

  function makeNewCategorySelect(currentFilter) {
    var select = el('select', 'edit-category');
    select.id  = 'new-category';
    select.style.cssText = 'padding:8px 12px;border-radius:40px;background:rgba(0,0,0,0.4);color:white;border:1px solid var(--border)';
    CATEGORIES.forEach(function (opt) {
      var option = document.createElement('option');
      option.value       = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });
    select.style.display = (currentFilter === 'all') ? 'inline-block' : 'none';
    return select;
  }

  function makeDeadlinePicker() {
    var d = el('input', 'edit-deadline');
    d.type = 'date';
    d.id   = 'new-deadline';
    d.style.cssText = 'padding:8px 12px;border-radius:40px;background:rgba(0,0,0,0.4);color:white;border:1px solid var(--border)';
    return d;
  }

  function renderAddForm(state, signal) {
    var newInput  = makeNewInput();
    var catSelect = makeNewCategorySelect(state.model.categoryFilter);
    var deadline  = makeDeadlinePicker();

    var addBtn = el('button', 'auth-submit');
    addBtn.textContent  = '+ Add';
    addBtn.style.cssText = 'padding:8px 20px;width:auto';
    addBtn.addEventListener('click', function () {
      if (newInput.input.value.trim()) signal('ADD')();
    });
    newInput.input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (newInput.input.value.trim()) signal('ADD')(); }
    });

    var form = el('div');
    form.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px';
    appendAll(form, [newInput.wrap, catSelect, deadline, addBtn]);
    return form;
  }

  // ─── Todo list ────────────────────────────────────────────────────────────────

  function todoPassesFilter(todo, hash, categoryFilter) {
    var statusOk   = hash === '#/active' ? !todo.done : hash === '#/completed' ? todo.done : true;
    var categoryOk = categoryFilter === 'all' || todo.category === categoryFilter;
    return statusOk && categoryOk;
  }

  function renderTodoList(state, signal, renderFull) {
    var ul = el('ul', 'todo-list');
    state.model.todos
      .filter(function (t) { return todoPassesFilter(t, state.model.hash, state.model.categoryFilter); })
      .forEach(function (t) { ul.appendChild(renderTodoItem(t, state.model, signal, renderFull)); });
    return ul;
  }

  // ─── Footer panel ─────────────────────────────────────────────────────────────

  function renderFooterPanel(state, signal) {
    var left = state.model.todos.filter(function (t) { return !t.done; }).length;
    var countSpan = el('span', 'todo-count');
    countSpan.textContent = left + ' item' + (left !== 1 ? 's' : '') + ' left';

    var clearBtn = el('button', 'clear-completed');
    clearBtn.textContent = 'Clear completed';
    clearBtn.addEventListener('click', signal('CLEAR_COMPLETED'));

    var panel = el('div', 'footer-panel');
    appendAll(panel, [countSpan, clearBtn]);
    return panel;
  }

  // ─── Shell ────────────────────────────────────────────────────────────────────

  function renderShell(state, signal, actions, renderFull) {
    var h1 = el('h1');
    h1.innerHTML = '📋 TaskFlow';

    var headerArea = el('div', 'header-area');
    appendAll(headerArea, [h1, renderProgressBar()]);

    var todoCard = el('div', 'todo-card');
    appendAll(todoCard, [headerArea, renderAddForm(state, signal), renderTodoList(state, signal, renderFull), renderFooterPanel(state, signal)]);

    var main = el('div', 'main-content');
    main.appendChild(todoCard);

    var container = el('div', 'app-container');
    appendAll(container, [renderSidebar(state, actions, renderFull), main]);

    if (state.error) {
      var errDiv = el('div', 'taskflow-error');
      errDiv.textContent = state.error;
      container.insertBefore(errDiv, container.firstChild);
    }
    return container;
  }

  // ─── Signal handlers ──────────────────────────────────────────────────────────

  function getNewTaskFields(state) {
    var inputEl   = document.getElementById('new-todo');
    var catEl     = document.getElementById('new-category');
    var deadlineEl = document.getElementById('new-deadline');
    return {
      input:    inputEl,
      val:      inputEl ? inputEl.value.trim() : '',
      category: state.model.categoryFilter !== 'all' ? state.model.categoryFilter : (catEl ? catEl.value : 'personal'),
      deadline: deadlineEl ? deadlineEl.value : ''
    };
  }

  function onTaskAdded(task, fields, state, signal, renderFull) {
    var newTask = fromApiTask(task);
    newTask.category = fields.category;
    newTask.deadline = fields.deadline;
    setExtraFields(newTask.id, fields.category, fields.deadline);
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
    if (fields.input) { fields.input.value = ''; fields.input.disabled = false; fields.input.focus(); }
    var deadlineEl = document.getElementById('new-deadline');
    if (deadlineEl) deadlineEl.value = '';
  }

  function handleAdd(state, signal, renderFull, setError) {
    var fields = getNewTaskFields(state);
    if (!fields.val || (fields.input && fields.input.disabled)) return;
    if (fields.input) fields.input.disabled = true;
    request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: fields.val, status: 'todo' }) })
      .then(function (task) { onTaskAdded(task, fields, state, signal, renderFull); })
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
        renderFull(withAllDone(state.model));
      })
      .catch(setError);
  }

  function onAllToggled(tasks, state, renderFull) {
    state.model.todos = tasks.map(function (t) {
      var extra = getExtraFields(t.id);
      return { id: t.id, title: t.title, done: t.status === 'done', deadline: extra.deadline, category: extra.category };
    });
    renderFull(withAllDone(state.model));
  }

  function handleToggleAll(state, renderFull, setError) {
    var nextDone = !state.model.all_done;
    Promise.all(state.model.todos.map(function (t) {
      return request('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify({ status: statusFromDone(nextDone) }) });
    }))
      .then(function (tasks) { onAllToggled(tasks, state, renderFull); })
      .catch(setError);
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function createState(initialModel) {
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
    return state;
  }

  function createRenderFull(state, root, getActions, getSignal) {
    return function renderFull(model) {
      if (!root) return;
      state.model = model;
      window._taskflow_model = model;
      empty(root);
      if (!state.token) {
        root.appendChild(renderAuth(state, getActions()));
      } else {
        root.appendChild(renderShell(state, getSignal(), getActions(), renderFull));
        updateProgressAndConfetti(model);
        updateCounter(model);
      }
    };
  }

  function createActions(state, getLoadTasks, getRenderFull) {
    return {
      authenticate: function (email, password) {
        state.email   = email.trim().toLowerCase();
        state.error   = '';
        state.loading = true;
        getRenderFull()(state.model);
        var path = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        authRequest(path, state.email, password)
          .then(function (data) {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(EMAIL_KEY, data.user.email);
            state.token   = data.token;
            state.email   = data.user.email;
            state.loading = false;
            getLoadTasks()();
          })
          .catch(function (err) { state.loading = false; state.error = err.message || 'Error'; getRenderFull()(state.model); });
      },
      logout: function () {
        localStorage.removeItem(TOKEN_KEY);
        state.token       = '';
        state.model.todos = [];
        getRenderFull()(state.model);
      },
      switchMode: function (email) {
        state.email    = email.trim().toLowerCase();
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        getRenderFull()(state.model);
      }
    };
  }

  function mountTaskFlow(initialModel, rootElementId) {
    var root  = document.getElementById(rootElementId);
    var state = createState(initialModel);
    window._taskflow_model = state.model;

    var renderFull, actions, signal, loadTasks;

    function setError(err) {
      state.error = err.message || 'Something went wrong';
      if (err.status === 401) { actions.logout(); } else { renderFull(state.model); }
    }

    loadTasks = function () {
      state.loading = true;
      renderFull(state.model);
      return request('/api/tasks')
        .then(function (tasks) {
          state.model.todos = tasks.map(fromApiTask);
          state.model   = withAllDone(state.model);
          state.error   = '';
          state.loading = false;
          renderFull(state.model);
        })
        .catch(function (err) { state.loading = false; setError(err); });
    };

    renderFull = createRenderFull(state, root,
      function () { return actions; },
      function () { return signal; }
    );

    actions = createActions(state,
      function () { return loadTasks; },
      function () { return renderFull; }
    );

    signal = function (action, data) {
      return function () {
        switch (action) {
          case 'ADD':             handleAdd(state, signal, renderFull, setError);      break;
          case 'DELETE':          handleDelete(data, state, renderFull, setError);     break;
          case 'CLEAR_COMPLETED': handleClearCompleted(state, renderFull, setError);   break;
          case 'TOGGLE_ALL':      handleToggleAll(state, renderFull, setError);        break;
          default:                renderFull(state.model);
        }
      };
    };

    window.onhashchange = function () {
      state.model.hash = window.location.hash || '#/';
      renderFull(state.model);
    };

    renderFull(state.model);
    if (state.token) loadTasks();
  }

  window.mountTaskFlow = mountTaskFlow;
})();