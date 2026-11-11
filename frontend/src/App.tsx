import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import HowItWorks from './pages/HowItWorks'
import NewRun from './pages/NewRun'
import Records from './pages/Records'
import Review from './pages/Review'
import RunView from './pages/RunView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<NewRun />} />
          <Route path="runs" element={<Dashboard />} />
          <Route path="runs/:id" element={<RunView />} />
          <Route path="review" element={<Review />} />
          <Route path="records" element={<Records />} />
          <Route path="how" element={<HowItWorks />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
