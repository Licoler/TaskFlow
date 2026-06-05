if (typeof require !== 'undefined' && this.window !== this) {
  var { a, button, div, empty, footer, input, h1, header, label, li, mount,
    route, section, span, strong, text, ul } = require('./elmish.js');
}

var initial_model = {
  todos: [],
  hash: "#/"
}

/**
 * `update` transforms the `model` based on the `action`.
 * @param {String} action - the desired action to perform on the model.
 * @param {String} data - the data we want to "apply" to the item.
 * @param {Object} model - the App's (current) model (or "state").
 * @return {Object} new_model - the transformed model.
 */
function update(action, model, data) {
  var new_model = JSON.parse(JSON.stringify(model)) 

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
        if(item.id === data) {    
          item.done = !item.done; 
        }
      });

      var all_done = new_model.todos.filter(function(item) {
        return item.done === false; 
      }).length;
      new_model.all_done = all_done === 0 ? true : false;
      break;
    case 'TOGGLE_ALL':
      new_model.all_done = new_model.all_done ? false : true;
      new_model.todos.forEach(function (item) { 
        item.done = new_model.all_done;
      });
      break;
    case 'DELETE':
      new_model.todos = new_model.todos.filter(function (item) {
        return item.id !== data;
      });
      break;
    case 'EDIT':
      
      if (new_model.clicked && new_model.clicked === data &&
        Date.now() - 300 < new_model.click_time ) { 
          new_model.editing = data;
      }
      else {
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
      new_model.hash = 
        window.location.hash 
      break;
    default: 
      return model; 
  }   
  return new_model;
}

/**
 * `render_item` creates an DOM "tree" with a single Todo List Item
 * using the "elmish" DOM functions (`li`, `div`, `input`, `label` and `button`)
 * returns an `<li>` HTML element with a nested `<div>` which in turn has the:
 * + `<input type=checkbox>` which lets users to "Toggle" the status of the item
 * + `<label>` which displays the Todo item text (`title`) in a `<text>` node
 * + `<button class="destroy">` lets people "delete" a todo item.
 * see: https://github.com/dwyl/learn-elm-architecture-in-javascript/issues/52
 * @param  {Object} item the todo item object
 * @param {Object} model - the App's (current) model (or "state").
 * @param {Function} singal - the Elm Architicture "dispacher" which will run
 * @return {Object} <li> DOM Tree which is nested in the <ul>.
 * @example
 * // returns <li> DOM element with <div>, <input>. <label> & <button> nested
 * var DOM = render_item({id: 1, title: "Build Todo List App", done: false});
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

    ].concat(model && model.editing && model.editing === item.id ? [ // editing?
      input(["class=edit", "id=" + item.id, "value=" + item.title, "autofocus"])
    ] : []) 
    )
  )
}

/**
 * `render_main` renders the `<section class="main">` of the Todo List App
 * which contains all the "main" controls and the `<ul>` with the todo items.
 * @param {Object} model - the App's (current) model (or "state").
 * @param {Function} singal - the Elm Architicture "dispacher" which will run
 * @return {Object} <section> DOM Tree which containing the todo list <ul>, etc.
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
            case '#/active':
              return !item.done;
            case '#/completed':
              return item.done;
            default: 
              return item;
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
 * `render_footer` renders the `<footer class="footer">` of the Todo List App
 * which contains count of items to (still) to be done and a `<ul>` "menu"
 * with links to filter which todo items appear in the list view.
 * @param {Object} model - the App's (current) model (or "state").
 * @param {Function} singal - the Elm Architicture "dispacher" which will run
 * @return {Object} <section> DOM Tree which containing the <footer> element.
 * @example
 * // returns <footer> DOM element with other DOM elements nested:
 * var DOM = render_footer(model);
 */
function render_footer (model, signal) {

  var done = (model.todos && model.todos.length > 0) ?
    model.todos.filter( function (i) { return i.done; }).length : 0;
  var count = (model.todos && model.todos.length > 0) ?
    model.todos.filter( function (i) { return !i.done; }).length : 0;

  var display = (count > 0 || done > 0) ? "block" : "none";

  var done = (model.todos && model.todos.length > 0) ?
    (model.todos.length - count) : 0;
  var display_clear =  (done > 0) ? "block;" : "none;";

  var left = (" item" + ( count > 1 || count === 0 ? 's' : '') + " left");

  return (
    footer(["class=footer", "id=footer", "style=display:" + display], [
      span(["class=todo-count", "id=count"], [
        strong(count),
        text(left)
      ]),
      ul(["class=filters"], [
        li([], [
          a([
            "href=#/", "id=all", "class=" +
            (model.hash === '#/' ? "selected" : '')
          ],
          [text("All")])
        ]),
        li([], [
          a([
            "href=#/active", "id=active", "class=" +
            (model.hash === '#/active' ? "selected" : '')
          ],
          [text("Active")])
        ]),
        li([], [
          a([
            "href=#/completed", "id=completed", "class=" +
            (model.hash === '#/completed' ? "selected" : '')
          ],
          [text("Completed")])
        ])
      ]),
      button(["class=clear-completed", "style=display:" + display_clear,
        typeof signal === 'function' ? signal('CLEAR_COMPLETED') : ''
        ],
        [
          text("Clear completed ["),
          span(["id=completed-count"], [
            text(done)
          ]),
          text("]")
        ]
      )
    ])
  )
}

/**
 * `view` renders the entire Todo List App
 * which contains count of items to (still) to be done and a `<ul>` "menu"
 * with links to filter which todo items appear in the list view.
 * @param {Object} model - the App's (current) model (or "state").
 * @param {Function} singal - the Elm Architicture "dispacher" which will run
 * @return {Object} <section> DOM Tree which containing all other DOM elements.
 * @example
 * // returns <section class="todo-app"> DOM element with other DOM els nested:
 * var DOM = view(model);
 */
function view (model, signal) {

  return (
    section(["class=todoapp"], [ 
      header(["class=header"], [
        h1([], [
          text("todos")
        ]),
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
 * and respond according to a pre-defined update/action.
 * @param {Function} singal - the Elm Architicture "dispacher" which will run
 * both the "update" and "render" functions when invoked with singal(action)
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
