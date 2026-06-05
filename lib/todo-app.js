if (typeof require !== 'undefined' && this.window !== this) {
  var { a, button, div, empty, footer, input, h1, header, label, li, mount,
    route, section, span, strong, text, ul } = require('./elmish.js');
}

var initial_model = {
  todos: [],
  hash: "#/"
}

/**
 * Запускает конфетти — вызывается когда все задачи выполнены.
 */
function fireConfetti() {
  if (typeof confetti !== 'function') return;
  var count = 200;
  var defaults = { origin: { y: 0.7 } };

  function fire(particleRatio, opts) {
    confetti(Object.assign({}, defaults, opts, {
      particleCount: Math.floor(count * particleRatio)
    }));
  }

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2,  { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1,  { spread: 120, startVelocity: 45 });
}

/**
 * `update` transforms the `model` based on the `action`.
 * @param {String} action - the desired action to perform on the model.
 * @param {Object} model - the App's (current) model (or "state").
 * @param {*} data - the data we want to "apply" to the item.
 * @return {Object} new_model - the transformed model.
 */
function update(action, model, data) {
  var new_model = JSON.parse(JSON.stringify(model));

  switch(action) {
    case 'ADD':
      var last = (typeof model.todos !== 'undefined' && model.todos.length > 0)
        ? model.todos[model.todos.length - 1] : null;
      var id = last ? last.id + 1 : 1;
      var input = document.getElementById('new-todo');
      new_model.todos = (new_model.todos && new_model.todos.length > 0)
        ? new_model.todos : [];
      new_model.todos.push({
        id: id,
        title: data || input.value.trim(),
        done: false
      });
      break;

    case 'TOGGLE':
      new_model.todos.forEach(function (item) {
        if (item.id === data) {
          item.done = !item.done;
        }
      });

      var remaining = new_model.todos.filter(function(item) {
        return item.done === false;
      }).length;

      new_model.all_done = remaining === 0;

      // 🎉 Конфетти — если все задачи выполнены (и список не пустой)
      if (new_model.all_done && new_model.todos.length > 0) {
        setTimeout(fireConfetti, 100);
      }
      break;

    case 'TOGGLE_ALL':
      new_model.all_done = new_model.all_done ? false : true;
      new_model.todos.forEach(function (item) {
        item.done = new_model.all_done;
      });

      // 🎉 Конфетти — если «отметить все» поставило все в done
      if (new_model.all_done && new_model.todos.length > 0) {
        setTimeout(fireConfetti, 100);
      }
      break;

    case 'DELETE':
      new_model.todos = new_model.todos.filter(function (item) {
        return item.id !== data;
      });
      break;

    case 'EDIT':
      if (new_model.clicked && new_model.clicked === data &&
        Date.now() - 300 < new_model.click_time) {
          new_model.editing = data;
      } else {
        new_model.clicked = data;
        new_model.click_time = Date.now();
        new_model.editing = false;
      }
      break;

    case 'SAVE':
      var edit = document.getElementsByClassName('edit')[0];
      var value = edit.value;
      var id = parseInt(edit.id, 10);
      new_model.clicked = false;
      new_model.editing = false;

      if (!value || value.length === 0) {
        return update('DELETE', new_model, id);
      }
      new_model.todos = new_model.todos.map(function (item) {
        if (item.id === id && value && value.length > 0) {
          item.title = value.trim();
        }
        return item;
      });
      break;

    case 'CANCEL':
      new_model.clicked = false;
      new_model.editing = false;
      break;

    case 'CLEAR_COMPLETED':
      new_model.todos = new_model.todos.filter(function (item) {
        return !item.done;
      });
      break;

    case 'ROUTE':
      new_model.hash = window.location.hash;
      break;

    default:
      return model;
  }

  return new_model;
}

/**
 * `render_item` creates a DOM "tree" with a single Todo List Item.
 */
function render_item (item, model, signal) {
  return (
    li([
      "data-id=" + item.id,
      "id=" + item.id,
      item.done ? "class=completed" : "",
      model && model.editing && model.editing === item.id ? "class=editing" : ""
    ], [
      div(["class=view"], [
        input([
          item.done ? "checked=true" : "",
          "class=toggle",
          "type=checkbox",
          typeof signal === 'function' ? signal('TOGGLE', item.id) : ''
          ], []),
        label([ typeof signal === 'function' ? signal('EDIT', item.id) : '' ],
          [text(item.title)]),
        button(["class=destroy",
          typeof signal === 'function' ? signal('DELETE', item.id) : ''])
        ]
      ),
    ].concat(model && model.editing && model.editing === item.id ? [
      input(["class=edit", "id=" + item.id, "value=" + item.title, "autofocus"])
    ] : []))
  )
}

/**
 * `render_main` renders the `<section class="main">` of the Todo List App.
 */
function render_main (model, signal) {
  var display = "style=display:"
    + (model.todos && model.todos.length > 0 ? "block" : "none");

  return (
    section(["class=main", "id=main", display], [
      input(["id=toggle-all", "type=checkbox",
        typeof signal === 'function' ? signal('TOGGLE_ALL') : '',
        (model.all_done ? "checked=checked" : ""),
        "class=toggle-all"
      ], []),
      label(["for=toggle-all"], [ text("Mark all as complete") ]),
      ul(["class=todo-list"],
        (model.todos && model.todos.length > 0) ?
        model.todos
        .filter(function (item) {
          switch(model.hash) {
            case '#/active':    return !item.done;
            case '#/completed': return item.done;
            default:            return item;
          }
        })
        .map(function (item) {
          return render_item(item, model, signal)
        }) : null
      )
    ])
  )
}

/**
 * `render_footer` renders the `<footer class="footer">` of the Todo List App.
 */
function render_footer (model, signal) {
  var done = (model.todos && model.todos.length > 0) ?
    model.todos.filter(function (i) { return i.done; }).length : 0;
  var count = (model.todos && model.todos.length > 0) ?
    model.todos.filter(function (i) { return !i.done; }).length : 0;

  var display = (count > 0 || done > 0) ? "block" : "none";
  var display_clear = (done > 0) ? "block;" : "none;";
  var left = (" item" + (count > 1 || count === 0 ? 's' : '') + " left");

  return (
    footer(["class=footer", "id=footer", "style=display:" + display], [
      span(["class=todo-count", "id=count"], [
        strong(count),
        text(left)
      ]),
      ul(["class=filters"], [
        li([], [
          a(["href=#/", "id=all", "class=" + (model.hash === '#/' ? "selected" : '')],
            [text("All")])
        ]),
        li([], [
          a(["href=#/active", "id=active", "class=" + (model.hash === '#/active' ? "selected" : '')],
            [text("Active")])
        ]),
        li([], [
          a(["href=#/completed", "id=completed", "class=" + (model.hash === '#/completed' ? "selected" : '')],
            [text("Completed")])
        ])
      ]),
      button(["class=clear-completed", "style=display:" + display_clear,
        typeof signal === 'function' ? signal('CLEAR_COMPLETED') : ''
        ], [
          text("Clear completed ["),
          span(["id=completed-count"], [ text(done) ]),
          text("]")
        ]
      )
    ])
  )
}

/**
 * `view` renders the entire Todo List App.
 */
function view (model, signal) {
  return (
    section(["class=todoapp"], [
      header(["class=header"], [
        h1([], [ text("todos") ]),
        input([
          "id=new-todo",
          "class=new-todo",
          "placeholder=What needs to be done?",
          "autofocus"
        ], [])
      ]),
      render_main(model, signal),
      render_footer(model, signal)
    ])
  );
}

/**
 * `subscriptions` let us "listen" for events such as "key press" or "click".
 */
function subscriptions (signal) {
  var ENTER_KEY = 13;
  var ESCAPE_KEY = 27;

  document.addEventListener('keyup', function handler (e) {
    switch(e.keyCode) {
      case ENTER_KEY:
        var editing = document.getElementsByClassName('editing');
        if (editing && editing.length > 0) {
          signal('SAVE')();
        }
        break;
      case ESCAPE_KEY:
        signal('CANCEL')();
        break;
    }
  });

  window.onhashchange = function route () {
    signal('ROUTE')();
  }
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
  }
}
