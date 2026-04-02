import React, { useState, useEffect } from 'react'
import Loading from './Loading'
import toast from 'react-hot-toast'
import { useAppContext } from '../context/AppContext'

const Community = () => {
const { axios, token } = useAppContext()

const [images, setImages] = useState([])
const [loading, setLoading] = useState(true)

const handleDeleteImage = async (event, messageId) => {
  event.preventDefault()
  event.stopPropagation()

  const shouldDelete = window.confirm("Delete this community image for everyone?")
  if (!shouldDelete) return

  try {
    const { data } = await axios.delete(`/api/v1/users/published-images/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (data?.success) {
      setImages((prevImages) => prevImages.filter((image) => image?.messageId !== messageId))
      toast.success(data?.message || "Image deleted successfully")
      return
    }

    toast.error(data?.message || "Failed to delete image")
  } catch (error) {
    toast.error(error.response?.data?.message || "An error occurred while deleting image")
  }
}

const fetchImage = async () => {

  try {
   const { data } = await axios.get("/api/v1/users/published-images", {
    headers: { Authorization: `Bearer ${token}` },
   });
    if(data.success){
      setImages(data?.data || []);
    }
    else{
      toast.error(data.message || "Failed to fetch published images");
    }
  } catch (error) {
    toast.error(error.response?.data?.message || "An error occurred while fetching published images");
  }
  finally{
    setLoading(false)
  }
}

useEffect(() => {
  fetchImage()
}, [])

if(loading) 
  return <Loading/>

  return (
    <div className='p-6 pt-12 xl:px-12 2xl:px-20 w-full mx-auto h-full overflow-y-scroll'>
      <h2 className='text-xl font-semibold mb-6 text-gray-600 dark:text-purple-100'>Community Images</h2>
      
      {images.length > 0 ?(
        <div className="flex flex-wrap max-sm:justify-center gap-4">
          {images.map((item ,index) => (
            <a key={item?.messageId || index} href={item.imageUrl} target='_blank' className='relative group block rounded-lg overflow-hidden border border-gray-300 dark:border-purple-700 shadow-sm hover:shadow-md transition-shadow duration-300'>
              <img src={item.imageUrl} alt={item.title} className='w-full h-40 md:h-50
              2xl:h-62 object-cover rounded-lg shadow-md group-hover:scale-105 transition-transform duration-300 ease-in-out'/>
              <p className='absolute bottom-0  right-0 bg-black/50 bg-opacity-50 text-white text-center py-1 text-sm backdrop-blur px-4 rounded-tl-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300'>Created by {item.username || "Unknown"}</p>
              {item?.canDelete && (
                <button
                  type='button'
                  onClick={(event) => handleDeleteImage(event, item?.messageId)}
                  className='absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300'
                >
                  Delete
                </button>
              )}
            </a>
          ))}
        </div>
      ):(
        <p className='text-gray-500 text-center dark:text-purple-200 mt-10'>No images published yet.</p>
      )}
    </div>
  )
}

export default Community
