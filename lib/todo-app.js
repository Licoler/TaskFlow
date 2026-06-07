if (typeof require !== 'undefined' && this.window !== this) {
  var { a, button, div, empty, footer, input, h1, header, label, li, mount,
    route, section, span, strong, text, ul } = require('./elmish.js');
}

var initial_model = {
  todos: [],
  hash: '#/'
};

// ─── Confetti ─────────────────────────────────────────────────────────────────

function fireConfetti() {
  if (typeof confetti !== 'function') return;
  var bursts = [
    { ratio: 0.25, opts: { spread: 26, startVelocity: 55 } },
    { ratio: 0.2,  opts: { spread: 60 } },
    { ratio: 0.35, opts: { spread: 100, decay: 0.91, scalar: 0.8 } },
    { ratio: 0.1,  opts: { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 } },
    { ratio: 0.1,  opts: { spread: 120, startVelocity: 45 } }
  ];
  var base = { origin: { y: 0.7 }, particleCount: 200 };
  bursts.forEach(function (b) {
    confetti(Object.assign({}, base, b.opts, {
      particleCount: Math.floor(base.particleCount * b.ratio)
    }));
  });
}

function maybeFireConfetti(model) {
  if (model.all_done && model.todos.length > 0) {
    setTimeout(fireConfetti, 100);
  }
}

// ─── Update helpers ───────────────────────────────────────────────────────────

function calcAllDone(todos) {
  return todos.length > 0 && todos.every(function (t) { return t.done; });
}

function nextTodoId(todos) {
  return todos.length > 0 ? todos[todos.length - 1].id + 1 : 1;
}

function addTodo(model, title) {
  var todos = model.todos.concat({
    id: nextTodoId(model.todos),
    title: title || (document.getElementById('new-todo') || {}).value.trim(),
    done: false
  });
  return Object.assign({}, model, { todos: todos });
}

function toggleTodo(model, id) {
  var todos = model.todos.map(function (item) {
    return item.id === id ? Object.assign({}, item, { done: !item.done }) : item;
  });
  var next = Object.assign({}, model, {
    todos: todos,
    all_done: calcAllDone(todos)
  });
  maybeFireConfetti(next);
  return next;
}

function toggleAll(model) {
  var next_all_done = !model.all_done;
  var todos = model.todos.map(function (item) {
    return Object.assign({}, item, { done: next_all_done });
  });
  var next = Object.assign({}, model, { todos: todos, all_done: next_all_done });
  maybeFireConfetti(next);
  return next;
}

function deleteTodo(model, id) {
  return Object.assign({}, model, {
    todos: model.todos.filter(function (item) { return item.id !== id; })
  });
}

function editTodo(model, id) {
  var isDoubleClick = model.clicked === id && Date.now() - 300 < model.click_time;
  return Object.assign({}, model, {
    editing: isDoubleClick ? id : false,
    clicked: id,
    click_time: Date.now()
  });
}

function saveTodo(model) {
  var edit = document.getElementsByClassName('edit')[0];
  var value = edit ? edit.value : '';
  var id = edit ? parseInt(edit.id, 10) : null;
  var next = Object.assign({}, model, { clicked: false, editing: false });

  if (!value || !value.length) return deleteTodo(next, id);

  next.todos = next.todos.map(function (item) {
    return item.id === id ? Object.assign({}, item, { title: value.trim() }) : item;
  });
  return next;
}

function clearCompleted(model) {
  return Object.assign({}, model, {
    todos: model.todos.filter(function (item) { return !item.done; })
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

var UPDATE_HANDLERS = {
  ADD: function (model, data) { return addTodo(model, data); },
  TOGGLE: function (model, data) { return toggleTodo(model, data); },
  TOGGLE_ALL: function (model) { return toggleAll(model); },
  DELETE: function (model, data) { return deleteTodo(model, data); },
  EDIT: function (model, data) { return editTodo(model, data); },
  SAVE: function (model) { return saveTodo(model); },
  CANCEL: function (model) { return Object.assign({}, model, { clicked: false, editing: false }); },
  CLEAR_COMPLETED: function (model) { return clearCompleted(model); },
  ROUTE: function (model) { return Object.assign({}, model, { hash: window.location.hash }); }
};

function update(action, model, data) {
  var handler = UPDATE_HANDLERS[action];
  if (!handler) return model;
  return handler(JSON.parse(JSON.stringify(model)), data);
}

// ─── View helpers ─────────────────────────────────────────────────────────────

function render_item(item, model, signal) {
  var isEditing = model && model.editing === item.id;
  var attrs = [
    'data-id=' + item.id,
    'id=' + item.id,
    item.done ? 'class=completed' : '',
    isEditing ? 'class=editing' : ''
  ];

  var viewChildren = [
    input([
      item.done ? 'checked=true' : '',
      'class=toggle',
      'type=checkbox',
      typeof signal === 'function' ? signal('TOGGLE', item.id) : ''
    ], []),
    label([typeof signal === 'function' ? signal('EDIT', item.id) : ''],
      [text(item.title)]),
    button(['class=destroy',
      typeof signal === 'function' ? signal('DELETE', item.id) : ''])
  ];

  var children = [div(['class=view'], viewChildren)];

  if (isEditing) {
    children.push(input(['class=edit', 'id=' + item.id, 'value=' + item.title, 'autofocus']));
  }

  return li(attrs, children);
}

function render_main(model, signal) {
  var display = 'style=display:' + (model.todos && model.todos.length > 0 ? 'block' : 'none');
  var filteredTodos = filterTodos(model);

  return section(['class=main', 'id=main', display], [
    input([
      'id=toggle-all', 'type=checkbox',
      typeof signal === 'function' ? signal('TOGGLE_ALL') : '',
      model.all_done ? 'checked=checked' : '',
      'class=toggle-all'
    ], []),
    label(['for=toggle-all'], [text('Mark all as complete')]),
    ul(['class=todo-list'], filteredTodos.map(function (item) {
      return render_item(item, model, signal);
    }))
  ]);
}

function filterTodos(model) {
  if (!model.todos) return [];
  return model.todos.filter(function (item) {
    if (model.hash === '#/active') return !item.done;
    if (model.hash === '#/completed') return item.done;
    return true;
  });
}

function render_footer(model) {
  var todos = model.todos || [];
  var done = todos.filter(function (i) { return i.done; }).length;
  var count = todos.length - done;
  var display = (count > 0 || done > 0) ? 'block' : 'none';
  var leftLabel = ' item' + (count !== 1 ? 's' : '') + ' left';

  return footer(['class=footer', 'id=footer', 'style=display:' + display], [
    span(['class=todo-count', 'id=count'], [strong(count), text(leftLabel)]),
    ul(['class=filters'], [
      li([], [a(['href=#/', 'id=all', 'class=' + (model.hash === '#/' ? 'selected' : '')], [text('All')])]),
      li([], [a(['href=#/active', 'id=active', 'class=' + (model.hash === '#/active' ? 'selected' : '')], [text('Active')])]),
      li([], [a(['href=#/completed', 'id=completed', 'class=' + (model.hash === '#/completed' ? 'selected' : '')], [text('Completed')])])
    ]),
    button([
      'class=clear-completed',
      'style=display:' + (done > 0 ? 'block;' : 'none;'),
      typeof signal === 'function' ? signal('CLEAR_COMPLETED') : ''
    ], [text('Clear completed ['), span(['id=completed-count'], [text(done)]), text(']')])
  ]);
}

function view(model, signal) {
  return section(['class=todoapp'], [
    header(['class=header'], [
      h1([], [text('todos')]),
      input(['id=new-todo', 'class=new-todo', 'placeholder=What needs to be done?', 'autofocus'], [])
    ]),
    render_main(model, signal),
    render_footer(model, signal)
  ]);
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

function subscriptions(signal) {
  var ENTER_KEY = 13;
  var ESCAPE_KEY = 27;

  document.addEventListener('keyup', function (e) {
    if (e.keyCode === ENTER_KEY) {
      var editing = document.getElementsByClassName('editing');
      if (editing && editing.length > 0) signal('SAVE')();
    } else if (e.keyCode === ESCAPE_KEY) {
      signal('CANCEL')();
    }
  });

  window.onhashchange = function () { signal('ROUTE')(); };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    model: initial_model,
    update: update,
    render_item: render_item,
    render_main: render_main,
    render_footer: render_footer,
    subscriptions: subscriptions,
    view: view
  };
}
