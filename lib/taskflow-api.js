(function () {
  var TOKEN_KEY = 'taskflow_token';
  var EMAIL_KEY = 'taskflow_email';
  var API_URL_KEY = 'taskflow_api_url';

  function getApiBaseUrl() {
    var configured = window.TASKFLOW_API_URL ||
      localStorage.getItem(API_URL_KEY) ||
      'http://localhost:3000';

    return configured.replace(/\/$/, '');
  }

  function request(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';

    var token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      options.headers.Authorization = 'Bearer ' + token;
    }

    return fetch(getApiBaseUrl() + path, options).then(function (response) {
      return response.text().then(function (body) {
        var data = null;

        if (body) {
          try {
            data = JSON.parse(body);
          } catch (error) {
            data = { error: body };
          }
        }

        if (!response.ok) {
          var requestError = new Error(
            data && data.error ? data.error : 'Request failed'
          );
          requestError.status = response.status;
          throw requestError;
        }

        return data;
      });
    });
  }

  function authRequest(path, email, password) {
    return request(path, {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    });
  }

  function fromApiTask(task) {
    return {
      id: task.id,
      title: task.title,
      done: task.status === 'done'
    };
  }

  function statusFromDone(done) {
    return done ? 'done' : 'todo';
  }

  function withAllDone(model) {
    var next = JSON.parse(JSON.stringify(model));
    var active = next.todos.filter(function (item) {
      return !item.done;
    });

    next.all_done = next.todos.length > 0 && active.length === 0;
    return next;
  }

  function renderAuth(state, actions) {
    var section = document.createElement('section');
    var header = document.createElement('header');
    var title = document.createElement('h1');
    var form = document.createElement('form');
    var email = document.createElement('input');
    var password = document.createElement('input');
    var submit = document.createElement('button');
    var switchMode = document.createElement('button');
    var error = document.createElement('p');

    section.className = 'todoapp auth-app';
    header.className = 'header';
    title.textContent = 'TaskFlow';

    form.className = 'auth-form';
    email.className = 'auth-input';
    email.type = 'email';
    email.name = 'email';
    email.placeholder = 'Email';
    email.autocomplete = 'email';
    email.required = true;
    email.value = state.email || '';

    password.className = 'auth-input';
    password.type = 'password';
    password.name = 'password';
    password.placeholder = 'Password';
    password.autocomplete = state.authMode === 'login'
      ? 'current-password'
      : 'new-password';
    password.required = true;

    submit.className = 'auth-submit';
    submit.type = 'submit';
    submit.disabled = state.loading;
    submit.textContent = state.loading
      ? 'Please wait...'
      : (state.authMode === 'login' ? 'Log in' : 'Create account');

    switchMode.className = 'auth-switch';
    switchMode.type = 'button';
    switchMode.textContent = state.authMode === 'login'
      ? 'Need an account? Register'
      : 'Already have an account? Log in';

    error.className = 'auth-error';
    error.textContent = state.error || '';

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      actions.authenticate(email.value, password.value);
    });

    switchMode.addEventListener('click', function () {
      actions.switchMode(email.value);
    });

    form.appendChild(email);
    form.appendChild(password);
    form.appendChild(submit);
    form.appendChild(switchMode);
    form.appendChild(error);
    header.appendChild(title);
    section.appendChild(header);
    section.appendChild(form);

    return section;
  }

  function renderShell(state, signal, actions) {
    var wrapper = document.createElement('div');
    var session = document.createElement('div');
    var user = document.createElement('span');
    var logout = document.createElement('button');
    var error = document.createElement('p');

    session.className = 'taskflow-session';
    user.textContent = state.email || 'Signed in';
    logout.type = 'button';
    logout.textContent = 'Log out';
    logout.addEventListener('click', actions.logout);
    session.appendChild(user);
    session.appendChild(logout);
    wrapper.appendChild(session);

    if (state.error) {
      error.className = 'taskflow-error';
      error.textContent = state.error;
      wrapper.appendChild(error);
    }

    wrapper.appendChild(view(state.model, signal));
    return wrapper;
  }

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

    state.model.hash = window.location.hash || state.model.hash || '#/';

    function render() {
      empty(root);
      root.appendChild(state.token
        ? renderShell(state, signal, actions)
        : renderAuth(state, actions)
      );
    }

    function setError(error) {
      state.error = error.message || 'Something went wrong';

      if (error.status === 401) {
        actions.logout();
        return;
      }

      render();
    }

    function loadTasks() {
      state.loading = true;
      render();

      return request('/api/tasks')
        .then(function (tasks) {
          state.model.todos = tasks.map(fromApiTask);
          state.model = withAllDone(state.model);
          state.error = '';
          state.loading = false;
          render();
        })
        .catch(function (error) {
          state.loading = false;
          setError(error);
        });
    }

    function patchTask(id, body) {
      return request('/api/tasks/' + id, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
    }

    function replaceTask(task) {
      var updated = fromApiTask(task);
      state.model.todos = state.model.todos.map(function (item) {
        return item.id === updated.id ? updated : item;
      });
      state.model = withAllDone(state.model);
      state.error = '';
      render();
    }

    function removeTask(id) {
      state.model.todos = state.model.todos.filter(function (item) {
        return item.id !== id;
      });
      state.model = withAllDone(state.model);
      state.error = '';
      render();
    }

    var actions = {
      authenticate: function (email, password) {
        state.email = email.trim().toLowerCase();
        state.error = '';
        state.loading = true;
        render();

        authRequest(
          state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register',
          state.email,
          password
        )
          .then(function (data) {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(EMAIL_KEY, data.user.email);
            state.token = data.token;
            state.email = data.user.email;
            state.loading = false;
            return loadTasks();
          })
          .catch(function (error) {
            state.loading = false;
            setError(error);
          });
      },
      logout: function () {
        localStorage.removeItem(TOKEN_KEY);
        state.token = '';
        state.model.todos = [];
        state.error = '';
        render();
      },
      switchMode: function (email) {
        state.email = email.trim().toLowerCase();
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        state.error = '';
        render();
      }
    };

    function signal(action, data) {
      return function callback() {
        var item;
        var input;
        var edit;
        var value;
        var id;
        var nextDone;
        var completed;

        switch(action) {
          case 'ADD':
            input = document.getElementById('new-todo');
            value = input ? input.value.trim() : '';

            if (!value) {
              return;
            }

            request('/api/tasks', {
              method: 'POST',
              body: JSON.stringify({ title: value, status: 'todo' })
            })
              .then(function (task) {
                state.model.todos.push(fromApiTask(task));
                state.model = withAllDone(state.model);
                state.error = '';
                render();
              })
              .catch(setError);
            break;
          case 'TOGGLE':
            item = state.model.todos.filter(function (todo) {
              return todo.id === data;
            })[0];

            if (!item) {
              return;
            }

            patchTask(item.id, { status: statusFromDone(!item.done) })
              .then(replaceTask)
              .catch(setError);
            break;
          case 'TOGGLE_ALL':
            nextDone = !state.model.all_done;
            Promise.all(state.model.todos.map(function (todo) {
              return patchTask(todo.id, { status: statusFromDone(nextDone) });
            }))
              .then(function (tasks) {
                state.model.todos = tasks.map(fromApiTask);
                state.model = withAllDone(state.model);
                state.error = '';
                render();
              })
              .catch(setError);
            break;
          case 'DELETE':
            request('/api/tasks/' + data, { method: 'DELETE' })
              .then(function () {
                removeTask(data);
              })
              .catch(setError);
            break;
          case 'EDIT':
          case 'CANCEL':
          case 'ROUTE':
            state.model = update(action, state.model, data);
            render();
            break;
          case 'SAVE':
            edit = document.getElementsByClassName('edit')[0];

            if (!edit) {
              return;
            }

            value = edit.value.trim();
            id = parseInt(edit.id, 10);
            state.model.clicked = false;
            state.model.editing = false;

            if (!value) {
              request('/api/tasks/' + id, { method: 'DELETE' })
                .then(function () {
                  removeTask(id);
                })
                .catch(setError);
              return;
            }

            patchTask(id, { title: value })
              .then(replaceTask)
              .catch(setError);
            break;
          case 'CLEAR_COMPLETED':
            completed = state.model.todos.filter(function (todo) {
              return todo.done;
            });

            Promise.all(completed.map(function (todo) {
              return request('/api/tasks/' + todo.id, { method: 'DELETE' });
            }))
              .then(function () {
                state.model.todos = state.model.todos.filter(function (todo) {
                  return !todo.done;
                });
                state.model = withAllDone(state.model);
                state.error = '';
                render();
              })
              .catch(setError);
            break;
          default:
            state.model = update(action, state.model, data);
            render();
        }
      };
    }

    render();
    subscriptions(signal);

    if (state.token) {
      loadTasks();
    }
  }

  window.mountTaskFlow = mountTaskFlow;
})();
