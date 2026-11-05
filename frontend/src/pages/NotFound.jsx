import React from 'react';
import { Link } from 'react-router-dom';
export default function NotFound(){return <section className="page state-panel"><p className="eyebrow">404</p><h1>We can’t find that page</h1><Link className="button button-primary" to="/">Go home</Link></section>;}
