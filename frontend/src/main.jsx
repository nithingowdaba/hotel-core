import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes.jsx';
import { useSession } from './store/session.js';
import { api } from './api/client.js';
import './index.css';
const client=new QueryClient({defaultOptions:{queries:{retry:(count,error)=>error?.status>=400&&error.status<500?false:count<2,refetchOnWindowFocus:false}}});
const session=useSession.getState();
if(session.token){api.me().then((user)=>{useSession.getState().setSession(session.token,user);client.setQueryData(['me'],user);}).catch(()=>{});}
createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider></React.StrictMode>);
