import {
  MuiColorButtonProps,
  MuiColorInput,
  MuiColorInputProps,
  MuiColorInputFormat
} from 'mui-color-input';
import React from 'react';
import { ColorSwatch } from './ColorSwatch';

interface Props extends Omit<MuiColorInputProps, 'ref'> {
  format?: MuiColorInputFormat;
}

const ColorButtonElement = ({ bgColor, onClick }: MuiColorButtonProps) => {
  return <ColorSwatch hex={bgColor} onClick={onClick} />;
};

export const ColorPicker = ({
  value,
  onChange,
  format = 'hex',
  ...rest
}: Props) => {
  return (
    <MuiColorInput
      size="small"
      variant="standard"
      format={format}
      value={value}
      onChange={onChange}
      InputProps={{ disableUnderline: true }}
      Adornment={ColorButtonElement}
      sx={{
        width: 40,
        height: 40,
        '& .MuiInputBase-root': {
          padding: 0,
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center'
        },
        '& .MuiInputBase-input': {
          display: 'none'
        },
        '& .MuiInputAdornment-root': {
          margin: 0,
          width: '100%',
          height: '100%',
          maxHeight: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
      }}
      {...rest}
    />
  );
};
