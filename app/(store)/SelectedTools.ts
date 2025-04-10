import { create } from "zustand"

type propsTools = {
    objectSelected : {
        title : string | null,
        isSelected : boolean | false
    }
    setTools : ({title , isSelected} : {title : string , isSelected : boolean})=> void
}

export const SelectedTools = create<propsTools>((set )=>({
    objectSelected : {
        title : null,
        isSelected : false,
    },
    
    setTools : ({title , isSelected})=>{
        set(()=>({
            objectSelected:{
                title : title,
                isSelected : isSelected
            }
        }))
    }
}))