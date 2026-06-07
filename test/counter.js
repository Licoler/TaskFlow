var Inc = 'inc';                    
var Dec = 'dec';                     
var Res = 'reset';                   

function update (action, model) {    
  switch(action) {                 
    case Inc: return model + 1;      
    case Dec: return model - 1;      
    case Res: return 0;              
    default: return model;           
  }                                 
}

function view(model, signal) {
  return container([                          
    button('+', signal, Inc),                  
    div('count', model),                      
    button('-', signal, Dec),              
    button('Reset', signal, Res)             
  ]); 
} 

function mount(model, update, view, root_element_id) {
  var root = document.getElementById(root_element_id);
  function signal(action) {          
    return function callback() {    
      model = update(action, model); 
      empty(root);
      root.appendChild(view(model, signal));
    };
  };
  root.appendChild(view(model, signal));   
}


function empty(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
} 

function button(text, signal, action) {
  var button = document.createElement('button');
  var text = document.createTextNode(text);  
  button.appendChild(text);                  
  button.className = action;                
  button.id = action;
  
  button.onclick = signal(action);             
  return button;                              
} 

function div(divid, text) {
  var div = document.createElement('div');
  div.id = divid;
  div.className = divid;
  if(text !== undefined) { 
    var txt = document.createTextNode(text);
    div.appendChild(txt);
  }
  return div;
}

function container(elements) {
  var con = document.createElement('section');
  con.className = 'counter';
  elements.forEach(function(el) { con.appendChild(el) });
  return con;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    view: view,
    mount: mount,
    update: update,
    div: div,
    button: button,
    empty: empty,
  }
}
