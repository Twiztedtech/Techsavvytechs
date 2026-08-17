import imageUrlBuilder, {type SanityImageSource} from '@sanity/image-url'
import {sanityConfig} from './config'

const builder = imageUrlBuilder(sanityConfig)

export const urlFor = (source: SanityImageSource) => builder.image(source).auto('format')
