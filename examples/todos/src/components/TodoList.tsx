import React, { Component } from 'react';
import store from '../store';

const { withModel, useModels } = store;

class TodoList extends Component<any> {
  onRemove = (index) => {
    const [, actions] = this.props.model;
    actions.remove(index);
  }

  onToggle = (index) => {
    const [, actions] = this.props.model;
    actions.toggle(index);
  }

  render() {
    const { title, model } = this.props;
    const [ state, , actionsState ] = model;
    const { dataSource, subTitle } = state;
    return (
      <div>
        <h2>{title}</h2>
        <p>
          Using Class Component, SubTitle is {subTitle}
        </p>
        <ul>
          {dataSource.map(({ name, done = false }, index) => (
            <li key={index}>
              <label>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => this.onToggle(index)}
                />
                {done ? <s>{name}</s> : <span>{name}</span>}
              </label>
              {
                actionsState.remove.isLoading ?
                  '...deleting...' :
                  <button type="submit" onClick={() => this.onRemove(index)}>-</button>
              }
            </li>
          ))}
        </ul>
      </div>
    );
  }
}

export default withModel(
  'todos',
  (state) => ({ ...state, subTitle: 'SubTitle' }),
  (actions) => actions,
  (actionsState) => actionsState,
)(TodoList);
