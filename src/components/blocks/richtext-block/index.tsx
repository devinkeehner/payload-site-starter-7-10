import React from 'react';
export const RichTextBlock: React.FC<{ richText: any }> = ({ richText }) => {
  // You may want to use your own rich text renderer here
  return (
    <div className="richtext-block">
      {/* Replace with your preferred rich text renderer if needed */}
      {richText}
    </div>
  );
};
