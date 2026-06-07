
if (typeof require !== 'undefined' && this.window !== this) {
  var { button, div, empty, mount, text } = require('../lib/elmish.js');
}

function update (action, model) {    
  switch(action) {                   
    case 'inc': return model + 1;   
    case 'dec': return model - 1;   
    case 'reset': return 0;          
    default: return model;           
  }                                  
}

function view (model, signal) {
  return div([], [
    button(["class=inc", "id=inc", signal('inc')], [text('+')]), 
    div(["class=count", "id=count"], [text(model.toString())]), 
    button(["class=dec", "id=dec", signal('dec')], [text('-')]),
    button(["class=reset", "id=reset", signal('reset')], [text('Reset')])
  ]);
}

function subscriptions (signal) {
  var UP_KEY = 38; 
  var DOWN_KEY = 40; 
  document.addEventListener('keyup', function handler (e) {
    switch (e.keyCode) {
      case UP_KEY:
        signal('inc')(); 
        break;
      case DOWN_KEY:
        signal('dec')();
        break;
    }
  });
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    subscriptions: subscriptions,
    view: view,
    update: update,
  }
}
