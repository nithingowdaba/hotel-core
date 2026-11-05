import React from 'react';
import { SafeImage } from '../lib/images.jsx';
import { formatMoney } from '../lib/format.js';
import { Stepper, VegMark } from './ui/index.jsx';
export default function MenuItem({ item, qty, disabled, onAdd }) { return <article className={`menu-item ${!item.is_available || disabled ? 'menu-item-disabled' : ''}`}><div className="menu-copy"><VegMark veg={item.is_veg}/><h3>{item.name}</h3><strong>{formatMoney(item.price)}</strong><p>{item.description || 'Made fresh with carefully selected ingredients.'}</p>{!item.is_available ? <span className="sold-out">Sold out</span> : disabled ? <span className="sold-out">Currently closed</span> : <Stepper qty={qty} label={item.name} onIncrement={onAdd} onDecrement={() => onAdd('decrement')}/>}</div><div className="menu-image-wrap"><SafeImage src={item.image_url} alt={item.name} kind="dish" className="menu-image" width={96} height={96}/></div></article>; }
