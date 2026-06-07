const test = require('tape');      
const fs = require('fs');           
const path = require('path');       
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'));
require('jsdom-global')(html);      
const app = require('../lib/todo-app.js'); 
const id = 'test-app';              
const elmish = require('../lib/elmish.js');

test('`model` (Object) has desired keys', function (t) {
  const keys = Object.keys(app.model);
  t.deepEqual(keys, ['todos', 'hash'], "`todos` and `hash` keys are present.");
  t.true(Array.isArray(app.model.todos), "model.todos is an Array")
  t.end();
});

test('`update` default case should return model unmodified', function (t) {
  const model = JSON.parse(JSON.stringify(app.model));
  const unmodified_model = app.update('UNKNOWN_ACTION', model);
  t.deepEqual(model, unmodified_model, "model returned unmodified");
  t.end();
});

test('update `ADD` a new todo item to model.todos Array', function (t) {
  const model = JSON.parse(JSON.stringify(app.model)); 
  t.equal(model.todos.length, 0, "initial model.todos.length is 0");
  const updated_model = app.update('ADD', model, "Add Todo List Item");
  const expected = { id: 1, title: "Add Todo List Item", done: false };
  t.equal(updated_model.todos.length, 1, "updated_model.todos.length is 1");
  t.deepEqual(updated_model.todos[0], expected, "Todo list item added.");
  t.end();
});

test('update `TOGGLE` a todo item from done=false to done=true', function (t) {
  const model = JSON.parse(JSON.stringify(app.model)); 
  const model_with_todo = app.update('ADD', model, "Toggle a todo list item");
  const item = model_with_todo.todos[0];
  const model_todo_done = app.update('TOGGLE', model_with_todo, item.id);
  const expected = { id: 1, title: "Toggle a todo list item", done: true };
  t.deepEqual(model_todo_done.todos[0], expected, "Todo list item Toggled.");
  t.end();
});

test('`TOGGLE` (undo) a todo item from done=true to done=false', function (t) {
  const model = JSON.parse(JSON.stringify(app.model)); 
  const model_with_todo = app.update('ADD', model, "Toggle a todo list item");
  const item = model_with_todo.todos[0];
  const model_todo_done = app.update('TOGGLE', model_with_todo, item.id);
  const expected = { id: 1, title: "Toggle a todo list item", done: true };
  t.deepEqual(model_todo_done.todos[0], expected, "Toggled done=false >> true");
 
  const model_second_item = app.update('ADD', model_todo_done, "Another todo");
  t.equal(model_second_item.todos.length, 2, "there are TWO todo items");
  
  const model_todo_undone = app.update('TOGGLE', model_second_item, item.id);
  const undone = { id: 1, title: "Toggle a todo list item", done: false };
  t.deepEqual(model_todo_undone.todos[0],undone, "Todo item Toggled > undone!");
  t.end();
});

function mock_signal () {
  return function inner_function() {
    console.log('done');
  }
}

test('render_item HTML for a single Todo Item', function (t) {
  const model = {
    todos: [
      { id: 1, title: "Learn Elm Architecture", done: true },
    ],
    hash: '#/' 
  };
  
  document.getElementById(id).appendChild(
    app.render_item(model.todos[0], model, mock_signal),
  );

  const done = document.querySelectorAll('.completed')[0].textContent;
  t.equal(done, 'Learn Elm Architecture', 'Done: Learn "TEA"');

  const checked = document.querySelectorAll('input')[0].checked;
  t.equal(checked, true, 'Done: ' + model.todos[0].title + " is done=true");

  elmish.empty(document.getElementById(id)); 
  t.end();
});

test('render_item HTML without a valid signal function', function (t) {
  const model = {
    todos: [
      { id: 1, title: "Learn Elm Architecture", done: true },
    ],
    hash: '#/' 
  };
  
  document.getElementById(id).appendChild(
    app.render_item(model.todos[0], model),
  );

  const done = document.querySelectorAll('.completed')[0].textContent;
  t.equal(done, 'Learn Elm Architecture', 'Done: Learn "TEA"');

  const checked = document.querySelectorAll('input')[0].checked;
  t.equal(checked, true, 'Done: ' + model.todos[0].title + " is done=true");

  elmish.empty(document.getElementById(id));
  t.end();
});

test('render_main "main" view using (elmish) HTML DOM functions', function (t) {
  const model = {
    todos: [
      { id: 1, title: "Learn Elm Architecture", done: true },
      { id: 2, title: "Build Todo List App",    done: false },
      { id: 3, title: "Win the Internet!",      done: false }
    ],
    hash: '#/' 
  };
  document.getElementById(id).appendChild(app.render_main(model, mock_signal));
  document.querySelectorAll('.view').forEach(function (item, index) {
    t.equal(item.textContent, model.todos[index].title,
      "index #" + index + " <label> text: " + item.textContent)
  })

  const inputs = document.querySelectorAll('input'); 
  [true, false, false].forEach(function(state, index){
    t.equal(inputs[index + 1].checked, state,
      "Todo #" + index + " is done=" + state)
  })
  elmish.empty(document.getElementById(id));
  t.end();
});

test('render_footer view using (elmish) HTML DOM functions', function (t) {
  const model = {
    todos: [
      { id: 1, title: "Learn Elm Architecture", done: true },
      { id: 2, title: "Build Todo List App",    done: false },
      { id: 3, title: "Win the Internet!",      done: false }
    ],
    hash: '#/' 
  };
  document.getElementById(id).appendChild(app.render_footer(model));

  const left = document.getElementById('count').innerHTML;
  t.equal(left, "<strong>2</strong> items left", "Todos remaining: " + left);

  t.equal(document.querySelectorAll('li').length, 3, "3 <li> in <footer>");

  const link_text = ['All', 'Active', 'Completed'];
  const hrefs = ['#/', '#/active', '#/completed'];
  document.querySelectorAll('a').forEach(function (a, index) {
    t.equal(a.textContent, link_text[index], "<footer> link #" + index
      + " is: " + a.textContent + " === " + link_text[index]);
    t.equal(a.href.replace('about:blank', ''), hrefs[index],
    "<footer> link #" + index + " href is: " + hrefs[index]);
  });

  const clear = document.querySelectorAll('.clear-completed')[0].textContent;
  t.equal(clear, 'Clear completed [1]',
    '<button> in <footer> "Clear completed [1]"');

  elmish.empty(document.getElementById(id)); 
  t.end();
});

test('render_footer 1 item left (pluarisation test)', function (t) {
  const model = {
    todos: [
      { id: 1, title: "Be excellent to each other!", done: false }
    ],
    hash: '#/' 
  };
  document.getElementById(id).appendChild(app.render_footer(model));

  const left = document.getElementById('count').innerHTML;
  t.equal(left, "<strong>1</strong> item left", "Todos remaining: " + left);

  elmish.empty(document.getElementById(id)); 
  t.end();
});

test('view renders the whole todo app using "partials"', function (t) {
  document.getElementById(id).appendChild(app.view(app.model)); 

  t.equal(document.querySelectorAll('h1')[0].textContent, "todos", "<h1>todos");
  
  const placeholder = document.getElementById('new-todo')
    .getAttribute("placeholder");
  t.equal(placeholder, "What needs to be done?", "paceholder set on <input>");

  const left = document.getElementById('count').innerHTML;
  t.equal(left, "<strong>0</strong> items left", "Todos remaining: " + left);

  elmish.empty(document.getElementById(id)); 
  t.end();
});

test('1. No Todos, should hide #footer and #main', function (t) {
  document.getElementById(id).appendChild(app.view({todos: []})); 

  const main_display = window.getComputedStyle(document.getElementById('main'));
  t.equal(main_display._values.display, 'none', "No Todos, hide #main");

  const main_footer= window.getComputedStyle(document.getElementById('footer'));
  t.equal(main_footer._values.display, 'none', "No Todos, hide #footer");

  elmish.empty(document.getElementById(id)); 
  t.end();
});


global.localStorage = (
  global.localStorage &&
  typeof global.localStorage.getItem === 'function' &&
  typeof global.localStorage.setItem === 'function' &&
  typeof global.localStorage.removeItem === 'function'
) ? global.localStorage : {
  getItem: function(key) {
   const value = this[key];
   return typeof value === 'undefined' ? null : value;
 },
 setItem: function (key, value) {
   this[key] = value;
 },
 removeItem: function (key) {
   delete this[key]
 }
}
localStorage.removeItem('todos-elmish_store');

test('2. New Todo, should allow me to add todo items', function (t) {
  elmish.empty(document.getElementById(id));
  elmish.mount({todos: []}, app.update, app.view, id, app.subscriptions);
  const new_todo = document.getElementById('new-todo');
  const todo_text = 'Make Everything Awesome!     '; 
  new_todo.value = todo_text;
  document.dispatchEvent(new KeyboardEvent('keyup', {'keyCode': 13}));
  const items = document.querySelectorAll('.view');
  t.equal(items.length, 1, "should allow me to add todo items");
  const actual = document.getElementById('1').textContent;
  t.equal(todo_text.trim(), actual, "should trim text input")

  const clone = document.getElementById(id).cloneNode(true);
  document.dispatchEvent(new KeyboardEvent('keyup', {'keyCode': 42}));
  t.deepEqual(document.getElementById(id), clone, "#" + id + " no change");

  t.equal(new_todo.value, '',
    "should clear text input field when an item is added")

  const main_display = window.getComputedStyle(document.getElementById('main'));
  t.equal('block', main_display._values.display,
    "should show #main and #footer when items added");
  const main_footer= window.getComputedStyle(document.getElementById('footer'));
  t.equal('block', main_footer._values.display, "item added, show #footer");

  elmish.empty(document.getElementById(id)); 
  localStorage.removeItem('todos-elmish_' + id);
  t.end();
});

test('3. Mark all as completed ("TOGGLE_ALL")', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Learn Elm Architecture", done: true },
      { id: 1, title: "Build Todo List App",    done: false },
      { id: 2, title: "Win the Internet!",      done: false }
    ],
    hash: '#/' 
  };

  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  
  const items = document.querySelectorAll('.view');

  document.querySelectorAll('.toggle').forEach(function(item, index) {
    t.equal(item.checked, model.todos[index].done,
      "Todo #" + index + " is done=" + item.checked
      + " text: " + items[index].textContent)
  })

  document.getElementById('toggle-all').click(); 
  document.querySelectorAll('.toggle').forEach(function(item, index) {
    t.equal(item.checked, true,
      "TOGGLE each Todo #" + index + " is done=" + item.checked
      + " text: " + items[index].textContent)
  });
  t.equal(document.getElementById('toggle-all').checked, true,
    "should allow me to mark all items as completed")



  document.getElementById('toggle-all').click(); 
  document.querySelectorAll('.toggle').forEach(function(item, index) {
    t.equal(item.checked, false,
      "TOGGLE_ALL Todo #" + index + " is done=" + item.checked
      + " text: " + items[index].textContent)
  })
  t.equal(document.getElementById('toggle-all').checked, false,
    "should allow me to clear the completion state of all items")

  
  document.querySelectorAll('.toggle').forEach(function(item, index) {
    item.click(); 
    t.equal(item.checked, true,
      ".toggle.click() (each) Todo #" + index + " which is done=" + item.checked
      + " text: " + items[index].textContent)
  });
  
  t.equal(document.getElementById('toggle-all').checked, true,
    "complete all checkbox should update state when items are completed")

  elmish.empty(document.getElementById(id)); 
  localStorage.removeItem('todos-elmish_store');
  t.end();
});

test('4. Item: should allow me to mark items as complete', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false }
    ],
    hash: '#/' 
  };
  
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  const item = document.getElementById('0')
  t.equal(item.textContent, model.todos[0].title, 'Item contained in model.');
  
  t.equal(document.querySelectorAll('.toggle')[0].checked, false,
  'Item starts out "active" (done=false)');


  
  document.querySelectorAll('.toggle')[0].click()
  t.equal(document.querySelectorAll('.toggle')[0].checked, true,
  'Item should allow me to mark items as complete');

 
  document.querySelectorAll('.toggle')[0].click()
  t.equal(document.querySelectorAll('.toggle')[0].checked, false,
  'Item should allow me to un-mark items as complete');
  t.end();
});

test('4.1 DELETE item by clicking <button class="destroy">', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false }
    ],
    hash: '#/'
  };
  
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  
  t.equal(document.querySelectorAll('.destroy').length, 1, "one destroy button")

  const item = document.getElementById('0')
  t.equal(item.textContent, model.todos[0].title, 'Item contained in DOM.');
  
  const button = item.querySelectorAll('button.destroy')[0];
  button.click()
  t.equal(document.querySelectorAll('button.destroy').length, 0,
    'there is no loger a <button class="destroy"> as the only item was DELETEd')
  t.equal(document.getElementById('0'), null, 'todo item successfully DELETEd');
  t.end();
});

test('5.1 Editing: > Render an item in "editing mode"', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Bootstrap for as long as you can", done: false },
      { id: 2, title: "Let's solve our own problem", done: false }
    ],
    hash: '#/', 
    editing: 2 
  };
  document.getElementById(id).appendChild(
    app.render_item(model.todos[2], model, mock_signal),
  );
  t.equal(document.querySelectorAll('.view > label')[0].onclick.toString(),
    mock_signal().toString(), "mock_signal is onclick attribute of label");

  t.equal(document.querySelectorAll('.editing').length, 1,
    "<li class='editing'> element is visible");
  t.equal(document.querySelectorAll('.edit').length, 1,
    "<input class='edit'> element is visible");
  t.equal(document.querySelectorAll('.edit')[0].value, model.todos[2].title,
    "<input class='edit'> has value: " + model.todos[2].title);
  t.end();
});

test('5.2 Double-click an item <label> to edit it', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Let's solve our own problem", done: false }
    ],
    hash: '#/' 
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  const label = document.querySelectorAll('.view > label')[1]
  label.click();
  label.click();
  t.equal(document.querySelectorAll('.editing').length, 1,
    "<li class='editing'> element is visible");
  t.equal(document.querySelectorAll('.edit')[0].value, model.todos[1].title,
    "<input class='edit'> has value: " + model.todos[1].title);
  t.end();
});

test('5.2.2 Slow clicks do not count as double-click > no edit!', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Let's solve our own problem", done: false }
    ],
    hash: '#/' 
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  const label = document.querySelectorAll('.view > label')[1]
  label.click();
  setTimeout(function (){
    label.click();
    t.equal(document.querySelectorAll('.editing').length, 0,
      "<li class='editing'> element is NOT visible");
    t.end();
  }, 301)
});

test('5.3 [ENTER] Key in edit mode triggers SAVE action', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Let's solve our own problem", done: false }
    ],
    hash: '#/', 
    editing: 1 
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  
  const updated_title = "Do things that don\'t scale!  "
  document.querySelectorAll('.edit')[0].value = updated_title;
  document.dispatchEvent(new KeyboardEvent('keyup', {'keyCode': 13}));
  const label = document.querySelectorAll('.view > label')[1].textContent;
  t.equal(label, updated_title.trim(),
      "item title updated to:" + updated_title + ' (trimmed)');
  t.end();
});

test('5.4 SAVE should remove the item if an empty text string was entered',
  function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Let's solve our own problem", done: false }
    ],
    hash: '#/', 
    editing: 1 
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  t.equal(document.querySelectorAll('.view').length, 2, 'todo count: 2');
  document.querySelectorAll('.edit')[0].value = '';
  document.dispatchEvent(new KeyboardEvent('keyup', {'keyCode': 13}));
  t.equal(document.querySelectorAll('.view').length, 1, 'todo count: 1');
  t.end();
});

test('5.5 CANCEL should cancel edits on escape', function (t) {
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Let's solve our own problem", done: false }
    ],
    hash: '#/', 
    editing: 1 
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  t.equal(document.querySelectorAll('.view > label')[1].textContent,
    model.todos[1].title, 'todo id 1 has title: ' + model.todos[1].title);
  document.querySelectorAll('.edit')[0].value = 'Hello World';
  document.dispatchEvent(new KeyboardEvent('keyup', {'keyCode': 27}));
  t.equal(document.querySelectorAll('.view > label')[1].textContent,
      model.todos[1].title, 'todo id 1 has title: ' + model.todos[1].title);
  localStorage.removeItem('todos-elmish_' + id);
  t.end();
});

test('6. Counter > should display the current number of todo items',
  function (t) {
  elmish.empty(document.getElementById(id));
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Bootstrap for as long as you can", done: false },
      { id: 2, title: "Let's solve our own problem", done: false }
    ],
    hash: '#/'
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  
  const count = parseInt(document.getElementById('count').textContent, 10);
  t.equal(count, model.todos.length, "displays todo item count: " + count);

  elmish.empty(document.getElementById(id)); 
  localStorage.removeItem('todos-elmish_' + id);
  t.end();
});

test('7. Clear Completed > should display the number of completed items',
  function (t) {
  elmish.empty(document.getElementById(id));
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Bootstrap for as long as you can", done: true },
      { id: 2, title: "Let's solve our own problem", done: true }
    ],
    hash: '#/'
  };
  
  elmish.mount(model, app.update, app.view, id, app.subscriptions);

  t.equal(document.querySelectorAll('.view').length, 3,
    "at the start, there are 3 todo items in the DOM.");

  const completed_count =
    parseInt(document.getElementById('completed-count').textContent, 10);
  const done_count = model.todos.filter(function(i) {return i.done }).length;
  t.equal(completed_count, done_count,
    "displays completed items count: " + completed_count);

  const button = document.querySelectorAll('.clear-completed')[0];
  button.click();

  t.equal(document.querySelectorAll('.view').length, 1,
    "after clearing completed items, there is only 1 todo item in the DOM.");

  t.equal(document.querySelectorAll('clear-completed').length, 0,
    'no clear-completed button when there are no done items.')

  elmish.empty(document.getElementById(id)); 
  localStorage.removeItem('todos-elmish_' + id);
  t.end();
});

test('8. Persistence > should persist its data', function (t) {
  elmish.empty(document.getElementById(id));
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false }
    ],
    hash: '#/'
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  t.equal(localStorage.getItem('todos-elmish_' + id),
    JSON.stringify(model), "data is persisted to localStorage");

  elmish.empty(document.getElementById(id)); 
  localStorage.removeItem('todos-elmish_' + id);
  t.end();
});

test('9. Routing > should allow me to display active/completed/all items',
  function (t) {
  localStorage.removeItem('todos-elmish_' + id);
  elmish.empty(document.getElementById(id));
  const model = {
    todos: [
      { id: 0, title: "Make something people want.", done: false },
      { id: 1, title: "Bootstrap for as long as you can", done: true },
      { id: 2, title: "Let's solve our own problem", done: true }
    ],
    hash: '#/active' 
  };
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  const mod = app.update('ROUTE', model);
 

  t.equal(document.querySelectorAll('.view').length, 1, "one active item");
  let selected = document.querySelectorAll('.selected')[0]
  t.equal(selected.id, 'active', "active footer filter is selected");

  
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  
  model.hash = '#/completed';
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  t.equal(document.querySelectorAll('.view').length, 2,
    "two completed items");
  selected = document.querySelectorAll('.selected')[0]
  t.equal(selected.id, 'completed', "completed footer filter is selected");

  
  elmish.empty(document.getElementById(id));
  localStorage.removeItem('todos-elmish_' + id);
  model.hash = '#/';
  elmish.mount(model, app.update, app.view, id, app.subscriptions);
  t.equal(document.querySelectorAll('.view').length, 3,
    "three items total");
  selected = document.querySelectorAll('.selected')[0]
  t.equal(selected.id, 'all', "all footer filter is selected");

  elmish.empty(document.getElementById(id)); 
  localStorage.removeItem('todos-elmish_' + id);
  t.end();
});
