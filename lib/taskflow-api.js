(function () {
  var TOKEN_KEY = 'taskflow_token';
  var EMAIL_KEY = 'taskflow_email';

  function getApiBaseUrl() {
    return 'https://taskflow-crtp.onrender.com'; // замените на свой бэкенд
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

  // Сохранение дополнительных полей (категория, дедлайн) в localStorage
  function getExtraFields(taskId) {
    var raw = localStorage.getItem('taskflow_extra_' + taskId);
    return raw ? JSON.parse(raw) : { category: 'personal', deadline: '' };
  }
  function setExtraFields(taskId, category, deadline) {
    localStorage.setItem('taskflow_extra_' + taskId, JSON.stringify({ category: category, deadline: deadline || '' }));
  }
  function deleteExtraFields(taskId) {
    localStorage.removeItem('taskflow_extra_' + taskId);
  }

  function fromApiTask(task) {
    var extra = getExtraFields(task.id);
    return {
      id: task.id,
      title: task.title,
      done: task.status === 'done',
      deadline: extra.deadline,
      category: extra.category
    };
  }

  function statusFromDone(done) { return done ? 'done' : 'todo'; }

  function withAllDone(model) {
    var next = JSON.parse(JSON.stringify(model));
    var active = next.todos.filter(function (i) { return !i.done; });
    next.all_done = next.todos.length > 0 && active.length === 0;
    return next;
  }

  function isOverdue(deadlineStr) {
    if (!deadlineStr) return false;
    var deadline = new Date(deadlineStr);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return deadline < today;
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

  // Обновление прогресс-бара и конфетти
  function updateProgressAndConfetti(model) {
    var fill = document.querySelector('.progress-fill');
    var stats = document.querySelector('.progress-stats');
    if (!fill || !stats) return;
    var total = model.todos.length;
    var completed = model.todos.filter(function(t) { return t.done; }).length;
    var percent = total === 0 ? 0 : (completed / total) * 100;
    fill.style.width = percent + '%';
    stats.innerHTML = '<span>' + completed + ' completed</span><span>' + (total - completed) + ' remaining</span>';
    if (total > 0 && completed === total && typeof canvasConfetti === 'function') {
      canvasConfetti({ particleCount: 180, spread: 80, origin: { y: 0.6 }, startVelocity: 25 });
    }
  }

  function updateCounter(model) {
    var countSpan = document.querySelector('.todo-count');
    if (countSpan) {
      var left = model.todos.filter(function(t) { return !t.done; }).length;
      countSpan.textContent = left + ' item' + (left !== 1 ? 's' : '') + ' left';
    }
  }

  // Плавное переключение статуса задачи (без перерисовки всего списка)
  function toggleTask(item, signal, model, renderFullCallback) {
    var li = document.querySelector('.todo-item[data-id="' + item.id + '"]');
    if (!li) return;
    var check = li.querySelector('.todo-checkbox');
    var newDone = !item.done;
    if (check) check.checked = newDone;
    if (newDone) li.classList.add('completed');
    else li.classList.remove('completed');
    item.done = newDone;
    updateProgressAndConfetti(model);
    updateCounter(model);
    // Отправляем запрос на сервер
    request('/api/tasks/' + item.id, { method: 'PATCH', body: JSON.stringify({ status: statusFromDone(newDone) }) })
      .catch(function() {
        // откат при ошибке
        if (check) check.checked = !newDone;
        if (!newDone) li.classList.add('completed');
        else li.classList.remove('completed');
        item.done = !newDone;
        updateProgressAndConfetti(model);
        updateCounter(model);
      });
  }

  // Удаление с анимацией
  function deleteTaskWithAnimation(id, model, renderFullCallback) {
    var el = document.querySelector('.todo-item[data-id="' + id + '"]');
    if (el) {
      el.classList.add('removing');
      setTimeout(function() {
        model.todos = model.todos.filter(function(t) { return t.id !== id; });
        deleteExtraFields(id);
        renderFullCallback(model);
      }, 200);
    } else {
      model.todos = model.todos.filter(function(t) { return t.id !== id; });
      deleteExtraFields(id);
      renderFullCallback(model);
    }
  }

  // Рендер одной задачи
  function renderTodoItem(item, model, signal, renderFullCallback) {
    var li = document.createElement('li');
    li.className = 'todo-item' + (item.done ? ' completed' : '');
    if (isOverdue(item.deadline) && !item.done) li.classList.add('overdue');
    li.setAttribute('data-id', item.id);

    var check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'todo-checkbox';
    check.checked = item.done;
    check.addEventListener('change', function(e) {
      e.stopPropagation();
      toggleTask(item, signal, model, renderFullCallback);
    });

    var titleSpan = document.createElement('span');
    titleSpan.className = 'todo-title';
    titleSpan.textContent = item.title;

    var categorySpan = document.createElement('span');
    categorySpan.className = 'todo-category ' + item.category;
    var categoryLabel = { personal: '👤 Personal', work: '💼 Work', study: '📚 Study' }[item.category] || '📌';
    categorySpan.textContent = categoryLabel;

    var deadlineSpan = document.createElement('span');
    deadlineSpan.className = 'todo-deadline';
    if (item.deadline) {
      var d = new Date(item.deadline);
      deadlineSpan.textContent = d.toLocaleDateString();
      if (isOverdue(item.deadline) && !item.done) deadlineSpan.classList.add('overdue');
    } else {
      deadlineSpan.textContent = '📅 No date';
    }

    var delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'delete-btn';
    delBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      signal('DELETE', item.id)();
    });

    li.appendChild(check);
    li.appendChild(titleSpan);
    li.appendChild(categorySpan);
    li.appendChild(deadlineSpan);
    li.appendChild(delBtn);

    // Редактирование по двойному клику
    li.addEventListener('dblclick', function() {
      enterEditMode(li, item, signal, renderFullCallback);
    });

    return li;
  }

  function enterEditMode(li, item, signal, renderFullCallback) {
    var oldContent = li.innerHTML;
    li.innerHTML = '';
    var editForm = document.createElement('div');
    editForm.className = 'edit-form';
    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = item.title;
    titleInput.className = 'edit-input';
    var deadlineInput = document.createElement('input');
    deadlineInput.type = 'date';
    deadlineInput.value = item.deadline ? item.deadline.slice(0,10) : '';
    deadlineInput.className = 'edit-deadline';
    var categorySelect = document.createElement('select');
    categorySelect.className = 'edit-category';
    var categories = [
      { value: 'personal', label: '👤 Personal' },
      { value: 'work', label: '💼 Work' },
      { value: 'study', label: '📚 Study' }
    ];
    categories.forEach(function(cat) {
      var opt = document.createElement('option');
      opt.value = cat.value;
      opt.textContent = cat.label;
      if (cat.value === item.category) opt.selected = true;
      categorySelect.appendChild(opt);
    });
    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'auth-submit';
    saveBtn.style.padding = '4px 12px';
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'logout-btn';
    cancelBtn.style.padding = '4px 12px';

    editForm.appendChild(titleInput);
    editForm.appendChild(deadlineInput);
    editForm.appendChild(categorySelect);
    editForm.appendChild(saveBtn);
    editForm.appendChild(cancelBtn);
    li.appendChild(editForm);

    function saveEdit() {
      var newTitle = titleInput.value.trim();
      var newDeadline = deadlineInput.value || null;
      var newCategory = categorySelect.value;
      if (newTitle === '') return;
      var patchBody = { title: newTitle };
      request('/api/tasks/' + item.id, { method: 'PATCH', body: JSON.stringify(patchBody) })
        .then(function(updatedTask) {
          item.title = updatedTask.title;
          item.deadline = newDeadline;
          item.category = newCategory;
          setExtraFields(item.id, item.category, item.deadline);
          var newLi = renderTodoItem(item, window._taskflow_model, signal, renderFullCallback);
          li.parentNode.replaceChild(newLi, li);
          var idx = window._taskflow_model.todos.findIndex(function(t) { return t.id === item.id; });
          if (idx !== -1) window._taskflow_model.todos[idx] = item;
          updateProgressAndConfetti(window._taskflow_model);
          updateCounter(window._taskflow_model);
        })
        .catch(function(err) {
          console.error(err);
          li.innerHTML = oldContent;
        });
    }

    saveBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', function() {
      li.innerHTML = oldContent;
    });
    titleInput.focus();
  }

  // ----- Рендер главного интерфейса с фильтрами -----
  function renderShell(state, signal, actions, renderFullCallback) {
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

    // Фильтры статуса
    var filtersUl = document.createElement('ul');
    filtersUl.className = 'filters';
    var filterAll = createFilterLink('#/', 'All', state.model.hash === '#/');
    var filterActive = createFilterLink('#/active', 'Active', state.model.hash === '#/active');
    var filterCompleted = createFilterLink('#/completed', 'Completed', state.model.hash === '#/completed');
    filtersUl.appendChild(filterAll);
    filtersUl.appendChild(filterActive);
    filtersUl.appendChild(filterCompleted);
    sidebar.appendChild(filtersUl);

    // Фильтры по категориям
    var categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-filters';
    var categoriesFilter = [
      { id: 'all', label: 'All categories' },
      { id: 'personal', label: '👤 Personal' },
      { id: 'work', label: '💼 Work' },
      { id: 'study', label: '📚 Study' }
    ];
    categoriesFilter.forEach(function(cat) {
      var btn = document.createElement('button');
      btn.textContent = cat.label;
      btn.className = 'category-btn' + (state.model.categoryFilter === cat.id ? ' active' : '');
      btn.addEventListener('click', function() {
        state.model.categoryFilter = cat.id;
        renderFullCallback(state.model);
      });
      categoryDiv.appendChild(btn);
    });
    sidebar.appendChild(categoryDiv);
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
    progressWrap.appendChild(progressBar);
    progressWrap.appendChild(progressStats);
    headerArea.appendChild(progressWrap);
    todoCard.appendChild(headerArea);

    // Поле ввода + выбор категории (если фильтр 'all' — показываем селектор, иначе скрываем)
    var addForm = document.createElement('div');
    addForm.style.display = 'flex';
    addForm.style.flexWrap = 'wrap';
    addForm.style.gap = '10px';
    addForm.style.marginBottom = '20px';
    var inputWrapper = document.createElement('div');
    inputWrapper.style.flex = '3';
    inputWrapper.style.position = 'relative';
    var inputIcon = document.createElement('span');
    inputIcon.className = 'input-icon';
    inputIcon.textContent = '✏️';
    var newInput = document.createElement('input');
    newInput.id = 'new-todo';
    newInput.className = 'new-todo';
    newInput.placeholder = 'What needs to be done?';
    newInput.style.width = '100%';
    inputWrapper.appendChild(inputIcon);
    inputWrapper.appendChild(newInput);
    addForm.appendChild(inputWrapper);

    var categorySelect = document.createElement('select');
    categorySelect.id = 'new-category';
    categorySelect.className = 'edit-category';
    categorySelect.style.padding = '8px 12px';
    categorySelect.style.borderRadius = '40px';
    categorySelect.style.background = 'rgba(0,0,0,0.4)';
    categorySelect.style.color = 'white';
    categorySelect.style.border = '1px solid var(--border)';
    var catOptions = [
      { value: 'personal', label: '👤 Personal' },
      { value: 'work', label: '💼 Work' },
      { value: 'study', label: '📚 Study' }
    ];
    catOptions.forEach(function(opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      categorySelect.appendChild(option);
    });
    // Если выбран фильтр категорий, отличный от 'all', то скрываем селектор и при добавлении будем использовать фильтр
    var isFilterAll = (state.model.categoryFilter === 'all');
    categorySelect.style.display = isFilterAll ? 'inline-block' : 'none';
    addForm.appendChild(categorySelect);

    var deadlineInput = document.createElement('input');
    deadlineInput.type = 'date';
    deadlineInput.id = 'new-deadline';
    deadlineInput.className = 'edit-deadline';
    deadlineInput.style.padding = '8px 12px';
    deadlineInput.style.borderRadius = '40px';
    deadlineInput.style.background = 'rgba(0,0,0,0.4)';
    deadlineInput.style.color = 'white';
    deadlineInput.style.border = '1px solid var(--border)';
    addForm.appendChild(deadlineInput);

    var addButton = document.createElement('button');
    addButton.textContent = '+ Add';
    addButton.className = 'auth-submit';
    addButton.style.padding = '8px 20px';
    addButton.style.width = 'auto';
    addButton.addEventListener('click', function() {
      var val = newInput.value.trim();
      if (val) signal('ADD')();
    });
    newInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (newInput.value.trim()) signal('ADD')();
      }
    });
    addForm.appendChild(addButton);
    todoCard.appendChild(addForm);

    // Список задач с учётом фильтров
    var todoList = document.createElement('ul');
    todoList.className = 'todo-list';
    var filtered = state.model.todos.filter(function(todo) {
      var statusOk = (state.model.hash === '#/active') ? !todo.done :
                     (state.model.hash === '#/completed') ? todo.done : true;
      var categoryOk = (state.model.categoryFilter === 'all') || (todo.category === state.model.categoryFilter);
      return statusOk && categoryOk;
    });
    filtered.forEach(function(todo) {
      todoList.appendChild(renderTodoItem(todo, state.model, signal, renderFullCallback));
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

    setTimeout(function() {
      updateProgressAndConfetti(state.model);
      updateCounter(state.model);
    }, 50);
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

  // ----- Основная логика приложения -----
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
    if (!state.model.categoryFilter) state.model.categoryFilter = 'all';
    window._taskflow_model = state.model;

    function renderFull(model) {
      if (!root) return;
      empty(root);
      root.appendChild(renderShell(state, signal, actions, renderFull));
      updateProgressAndConfetti(model);
      updateCounter(model);
    }

    function setError(err) {
      state.error = err.message || 'Something went wrong';
      if (err.status === 401) actions.logout();
      else renderFull(state.model);
    }

    function loadTasks() {
      state.loading = true;
      renderFull(state.model);
      return request('/api/tasks').then(function(tasks) {
        state.model.todos = tasks.map(fromApiTask);
        state.model = withAllDone(state.model);
        state.error = '';
        state.loading = false;
        renderFull(state.model);
      }).catch(function(err) {
        state.loading = false;
        setError(err);
      });
    }

    var actions = {
      authenticate: function(email, password) {
        state.email = email.trim().toLowerCase();
        state.error = '';
        state.loading = true;
        renderFull(state.model);
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
        renderFull(state.model);
      },
      switchMode: function(email) {
        state.email = email.trim().toLowerCase();
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        renderFull(state.model);
      }
    };

    function signal(action, data) {
      return function callback() {
        switch(action) {
          case 'ADD':
            var input = document.getElementById('new-todo');
            var val = input ? input.value.trim() : '';
            if (!val) return;
            if (input.disabled) return;
            input.disabled = true;
            // Определяем категорию:
            // Если выбран фильтр категорий (не 'all'), используем его, иначе берем из селектора
            var category;
            if (state.model.categoryFilter !== 'all') {
              category = state.model.categoryFilter;
            } else {
              var catSelect = document.getElementById('new-category');
              category = catSelect ? catSelect.value : 'personal';
            }
            var deadline = document.getElementById('new-deadline') ? document.getElementById('new-deadline').value : '';
            request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: val, status: 'todo' }) })
              .then(function(task) {
                var newTask = fromApiTask(task);
                newTask.category = category;
                newTask.deadline = deadline;
                setExtraFields(newTask.id, category, deadline);
                state.model.todos.push(newTask);
                state.model = withAllDone(state.model);
                renderFull(state.model);
                if (input) { input.value = ''; input.disabled = false; input.focus(); }
                if (document.getElementById('new-deadline')) document.getElementById('new-deadline').value = '';
              })
              .catch(setError);
            break;
          case 'DELETE':
            request('/api/tasks/' + data, { method: 'DELETE' })
              .then(function() { deleteTaskWithAnimation(data, state.model, renderFull); })
              .catch(setError);
            break;
          case 'CLEAR_COMPLETED':
            var completedIds = state.model.todos.filter(function(t) { return t.done; }).map(function(t) { return t.id; });
            Promise.all(completedIds.map(function(id) { return request('/api/tasks/' + id, { method: 'DELETE' }); }))
              .then(function() {
                state.model.todos = state.model.todos.filter(function(t) { return !t.done; });
                completedIds.forEach(deleteExtraFields);
                state.model = withAllDone(state.model);
                renderFull(state.model);
              }).catch(setError);
            break;
          case 'TOGGLE_ALL':
            var nextDone = !state.model.all_done;
            Promise.all(state.model.todos.map(function(t) {
              return request('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify({ status: statusFromDone(nextDone) }) });
            })).then(function(tasks) {
              state.model.todos = tasks.map(function(t, idx) {
                var extra = getExtraFields(t.id);
                return { id: t.id, title: t.title, done: t.status === 'done', deadline: extra.deadline, category: extra.category };
              });
              state.model = withAllDone(state.model);
              renderFull(state.model);
            }).catch(setError);
            break;
          default:
            state.model = update(action, state.model, data);
            renderFull(state.model);
        }
      };
    }

    window.onhashchange = function() {
      state.model.hash = window.location.hash || '#/';
      renderFull(state.model);
    };

    renderFull(state.model);
    if (state.token) loadTasks();
  }

  window.mountTaskFlow = mountTaskFlow;
})();