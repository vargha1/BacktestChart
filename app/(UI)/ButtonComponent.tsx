import React from 'react'

function ButtonComponent({...props}) {
  return (
    <button type={props.type} className={`${props.className} cursor-pointer`}  disabled={props.visible} key={props.key} onClick={props.onclick}>
        {props.text}
    </button>
  )
}

export default ButtonComponent