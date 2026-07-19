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
      InputProps={{ disableUnderline: true, type: 'hidden' }}
      Adornment={ColorButtonElement}
      {...rest}
    />
  );
};
