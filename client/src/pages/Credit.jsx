import React, { useState,useEffect } from 'react'
import { dummyPlans } from '../assets/assets'
import Loading from './Loading'
import { useNavigate } from 'react-router-dom'

const Credit = () => {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPlans = async () => {
    setPlans(dummyPlans)
    setLoading(false)
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  if (loading) 
    return <Loading />
  return (
    <div className='max-w-7xl h-screen overflow-y-scroll mx-auto px-4 sm:px-6 lg:px-8 py-12'>
      <h2 className='text-3xl text-center mb-10 xl:mt-30  font-bold  text-gray-800 dark:text-purple-100'>Credit Plans</h2>

      <div className='flex flex-wrap lg:flex-nowrap justify-center gap-5 '>
        {plans.map((plan)=>(
          <div key={plan._id} className={`border border-gray-200 hover:scale-105 dark:border-purple-700 rounded-lg p-6 w-full md:w-1/2 shadow hover:shadow-lg transition-shadow min-w-[300px] flex flex-col duration-300 ${plan._id === "pro" ? 'bg-purple-100 dark:bg-purple-900' : 'bg-white dark:bg-transparent'}`}>

            <div className='flex-1 '>
              <h3 className='text-2xl font-semibold  text-gray-800 dark:text-white mb-2'>{plan.name}</h3>
              <p className='text-2xl font-bold  text-purple-600 dark:text-gray-300 mb-4 '>${plan.price}
                <span className='text-base  font-normal text-gray-600 dark:text-purple-200'>{""} / {plan.credits} credits</span></p>
                <ul className='list-disc list-inside text-sm text-gray-700 dark:text-purple-200 space-y-1'>
                  {plan.features.map((feature, index) => (
                    <li key={index} className='text-gray-600 dark:text-purple-200  mb-2'>{feature}</li>
                  ))}
                </ul>
            </div>
                <button className='mt-6 bg-purple-600 hover:bg-purple-700 text-white active:bg-purple-800 py-2 px-4 rounded cursor-pointer transition-colors font-medium duration-300 '>Buy Now</button>

          </div>
        ))}

      </div>
      </div>
    
    
  )
}

export default Credit
